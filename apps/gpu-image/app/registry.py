"""Workflow Registry (docs/38 §AT.7; docs/73 §3).

Workflows are versioned ComfyUI API-format graphs kept in the repository
(`workflows/<id>@<version>.json`) and declared in `workflows/manifest.json`.
The manifest gives each workflow its slots (the only values a caller may set),
its models (by registry key, each pinned by repository + revision + file, with
its licence) and its limits. Callers name a workflow by id and version. They
never send a graph.

Every workflow has a sha256 over its canonical declaration and graph. The
registry has one too. `/capabilities` reports both, the approved deployment
manifest records them, and the execution token's authorization digest binds
the exact workflow hash, so a changed graph is a different authorization.

Binding (`bind`) fills declared slots only:
  string / int / float slots  set one or more node inputs;
  images                      LoadImage nodes in order; unused ones are removed
                              together with their links;
  lora                        a LoraLoaderModelOnly node; with no LoRA it is
                              bypassed (its consumers are wired to its input).
The bound graph is validated again (allow-listed node classes only, every link
resolves, one SaveImage output) and hashed for provenance.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .gateway.authz import canonical_json

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "workflows"
_ID = re.compile(r"^[a-z][a-z0-9.-]{2,63}$")
_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
# Inputs that name a model file; their values must be declared model names.
_LOADER_INPUTS = {"UNETLoader": "unet_name", "CLIPLoader": "clip_name", "VAELoader": "vae_name"}
# Licences a shipped model may carry (commercial use allowed, no revenue cap).
COMMERCIAL_LICENCES = {"Apache-2.0", "MIT", "BSD-3-Clause"}


class RegistryError(RuntimeError):
    """The registry on disk is invalid (the service refuses to start)."""


class SlotError(ValueError):
    """A request's values do not fit the workflow's slots (HTTP 422)."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("ascii")).hexdigest()


@dataclass(frozen=True)
class ModelDecl:
    key: str
    repo: str
    revision_env: str
    file: str
    folder: str  # ComfyUI models sub-folder
    name: str  # file name inside that folder, as the graph names it
    model: str
    licence: str
    licence_source: str

    @property
    def model_id(self) -> str:
        """Identity in the authorization digest: repository + file."""
        return f"{self.repo}:{self.file}"


@dataclass
class Workflow:
    id: str
    version: int
    purpose: str
    graph: dict
    slots: dict
    models: dict[str, str]  # role → model key
    output: str
    limits: dict
    model_label: str
    sha256: str = ""

    @property
    def ref(self) -> str:
        return f"{self.id}@{self.version}"

    @property
    def model_keys(self) -> list[str]:
        return sorted(set(self.models.values()))

    def declaration(self) -> dict:
        return {"id": self.id, "version": self.version, "purpose": self.purpose, "graph": self.graph,
                "slots": self.slots, "models": self.models, "output": self.output, "limits": self.limits,
                "modelLabel": self.model_label}


@dataclass
class Registry:
    runtime: dict
    custom_nodes: list[dict]
    allowed_nodes: set[str]
    models: dict[str, ModelDecl]
    workflows: dict[tuple[str, int], Workflow]
    sha256: str = ""
    problems: list[str] = field(default_factory=list)

    def get(self, wf_id: str, version: int) -> Workflow | None:
        return self.workflows.get((wf_id, version))

    def for_purpose(self, purpose: str) -> Workflow | None:
        found = [w for w in self.workflows.values() if w.purpose == purpose]
        return max(found, key=lambda w: w.version) if found else None

    def summary(self) -> list[dict]:
        out = []
        for w in sorted(self.workflows.values(), key=lambda w: (w.id, w.version)):
            out.append({
                "id": w.id, "version": w.version, "sha256": w.sha256, "purpose": w.purpose,
                "models": w.model_keys, "modelLabel": w.model_label,
                "licences": sorted({self.models[k].licence for k in w.model_keys}),
                "slots": sorted(w.slots), "limits": w.limits,
            })
        return out


# ── loading ─────────────────────────────────────────────────────────────────
def load_registry(directory: Path | str | None = None) -> Registry:
    d = Path(directory or os.environ.get("CINEFORGE_WORKFLOWS_DIR") or DEFAULT_DIR)
    try:
        manifest = json.loads((d / "manifest.json").read_text())
    except (OSError, ValueError) as e:
        raise RegistryError(f"workflow manifest unreadable: {e}") from None
    runtime = manifest.get("runtime") or {}
    if runtime.get("name") != "comfyui" or not _COMMIT.match(str(runtime.get("commit", ""))):
        raise RegistryError("runtime must be comfyui pinned to a 40-hex commit")
    custom_nodes = list(manifest.get("customNodes") or [])
    for n in custom_nodes:
        if not _COMMIT.match(str(n.get("commit", ""))) or not n.get("repo") or not n.get("licence"):
            raise RegistryError(f"custom node {n.get('repo')!r} must be pinned to a commit and carry a licence")
    allowed = set(manifest.get("allowedNodes") or [])
    if not allowed:
        raise RegistryError("allowedNodes is empty")

    models: dict[str, ModelDecl] = {}
    for key, m in (manifest.get("models") or {}).items():
        try:
            decl = ModelDecl(key=key, repo=m["repo"], revision_env=m["revisionEnv"], file=m["file"], folder=m["folder"],
                             name=m["name"], model=m["model"], licence=m["licence"], licence_source=m["licenceSource"])
        except KeyError as e:
            raise RegistryError(f"model {key!r} lacks {e}") from None
        if decl.licence not in COMMERCIAL_LICENCES:
            # docs/38 §C: no model whose licence forbids commercial use ships.
            raise RegistryError(f"model {key!r} licence {decl.licence!r} is not approved for commercial use")
        if not _SAFE_NAME.match(decl.name) or decl.folder not in {"diffusion_models", "text_encoders", "vae", "loras"}:
            raise RegistryError(f"model {key!r} has an unsafe name or folder")
        models[key] = decl

    workflows: dict[tuple[str, int], Workflow] = {}
    for entry in manifest.get("workflows") or []:
        wf = _load_workflow(d, entry, models, allowed)
        if (wf.id, wf.version) in workflows:
            raise RegistryError(f"duplicate workflow {wf.ref}")
        workflows[(wf.id, wf.version)] = wf
    if not workflows:
        raise RegistryError("no workflows declared")

    reg = Registry(runtime=runtime, custom_nodes=custom_nodes, allowed_nodes=allowed, models=models, workflows=workflows)
    reg.sha256 = sha256_text(canonical_json({
        "runtime": runtime, "customNodes": custom_nodes, "allowedNodes": sorted(allowed),
        "models": {k: m.__dict__ for k, m in sorted(models.items())},
        "workflows": sorted(f"{w.ref}#{w.sha256}" for w in workflows.values()),
    }))
    return reg


def _load_workflow(d: Path, entry: dict, models: dict[str, ModelDecl], allowed: set[str]) -> Workflow:
    wf_id, version = entry.get("id", ""), entry.get("version")
    if not _ID.match(wf_id) or not isinstance(version, int) or version < 1:
        raise RegistryError(f"bad workflow id/version {wf_id!r}@{version!r}")
    expected_file = f"{wf_id}@{version}.json"
    if entry.get("file") != expected_file:
        raise RegistryError(f"{wf_id}@{version}: file must be {expected_file}")
    try:
        graph = json.loads((d / expected_file).read_text())
    except (OSError, ValueError) as e:
        raise RegistryError(f"{expected_file}: {e}") from None
    wf = Workflow(id=wf_id, version=version, purpose=entry.get("purpose", ""), graph=graph,
                  slots=entry.get("slots") or {}, models=entry.get("models") or {}, output=str(entry.get("output", "")),
                  limits=entry.get("limits") or {}, model_label=entry.get("modelLabel") or wf_id)
    problems = validate_graph(graph, allowed, wf.output)
    for role, key in wf.models.items():
        if key not in models:
            problems.append(f"model role {role} names unknown model {key!r}")
    names = {models[k].name for k in wf.models.values() if k in models}
    for nid, node in graph.items():
        inp = _LOADER_INPUTS.get(node.get("class_type"))
        if inp and node.get("inputs", {}).get(inp) not in names:
            # A loader may only load a model the workflow declares (no substitution).
            problems.append(f"node {nid} loads undeclared model {node.get('inputs', {}).get(inp)!r}")
    problems += _check_slots(wf)
    if problems:
        raise RegistryError(f"{wf.ref}: " + "; ".join(problems))
    wf.sha256 = sha256_text(canonical_json(wf.declaration()))
    return wf


def _check_slots(wf: Workflow) -> list[str]:
    out = []
    for name, s in wf.slots.items():
        t = s.get("type")
        if t in ("string", "int", "float"):
            for node, inp in s.get("targets") or []:
                if node not in wf.graph or inp not in wf.graph[node].get("inputs", {}):
                    out.append(f"slot {name} targets missing {node}.{inp}")
            if not s.get("targets"):
                out.append(f"slot {name} has no targets")
        elif t == "images":
            for tgt in s.get("targets") or []:
                node = wf.graph.get(tgt.get("node"))
                if not node or node.get("class_type") != "LoadImage":
                    out.append(f"slot {name} target {tgt.get('node')} is not a LoadImage")
                for c, inp in tgt.get("consumers") or []:
                    if c not in wf.graph or wf.graph[c].get("inputs", {}).get(inp) != [tgt.get("node"), 0]:
                        out.append(f"slot {name} consumer {c}.{inp} is not linked to {tgt.get('node')}")
        elif t == "lora":
            node = wf.graph.get(s.get("node"))
            if not node or node.get("class_type") != "LoraLoaderModelOnly":
                out.append(f"slot {name} node is not a LoraLoaderModelOnly")
        else:
            out.append(f"slot {name} has unknown type {t!r}")
    return out


def validate_graph(graph: Any, allowed: set[str], output: str) -> list[str]:
    """Static checks on a graph (template or bound)."""
    if not isinstance(graph, dict) or not graph:
        return ["graph must be a non-empty object"]
    out = []
    for nid, node in graph.items():
        cls = node.get("class_type") if isinstance(node, dict) else None
        if cls not in allowed:
            out.append(f"node {nid} class {cls!r} is not allow-listed")
            continue
        for k, v in (node.get("inputs") or {}).items():
            if isinstance(v, list):
                if len(v) != 2 or v[0] not in graph or not isinstance(v[1], int):
                    out.append(f"node {nid}.{k} links to a missing node")
    saves = [nid for nid, n in graph.items() if isinstance(n, dict) and n.get("class_type") == "SaveImage"]
    if saves != [output]:
        out.append(f"exactly one SaveImage ({output}) must be the output, found {saves}")
    return out


# ── binding ─────────────────────────────────────────────────────────────────
@dataclass
class BindRequest:
    prompt: str
    negative: str | None
    seed: int
    width: int
    height: int
    steps: int | None = None
    image_names: list[str] = field(default_factory=list)
    lora_names: list[str] = field(default_factory=list)
    lora_scale: float | None = None
    output_prefix: str = "cineforge"


def check_request(wf: Workflow, req: BindRequest) -> list[str]:
    """Slot-level validation shared by the request check and the binder."""
    problems = []
    lim = wf.limits
    for name, value in (("width", req.width), ("height", req.height)):
        s = wf.slots.get(name, {})
        if not isinstance(value, int) or value < s.get("min", 1) or value > s.get("max", 4096):
            problems.append(f"{name} out of range {s.get('min')}..{s.get('max')}")
        elif value % int(s.get("multipleOf", 1)):
            problems.append(f"{name} must be a multiple of {s.get('multipleOf')}")
    if lim.get("maxMegapixels") and req.width * req.height > lim["maxMegapixels"] * 1_000_000:
        problems.append(f"more than {lim['maxMegapixels']} megapixels")
    p = wf.slots.get("prompt", {})
    if not req.prompt or not req.prompt.strip() or len(req.prompt) > p.get("maxLength", 4000):
        problems.append("prompt empty or too long")
    if req.negative is not None and len(req.negative) > wf.slots.get("negative", {}).get("maxLength", 2000):
        problems.append("negative prompt too long")
    sd = wf.slots.get("seed", {})
    if not (sd.get("min", 0) <= req.seed <= sd.get("max", 2**31 - 1)):
        problems.append("seed out of range")
    if req.steps is not None:
        st = wf.slots.get("steps", {})
        if not (st.get("min", 1) <= req.steps <= st.get("max", 50)):
            problems.append("steps out of range")
    img = next((s for s in wf.slots.values() if s.get("type") == "images"), None)
    if img is None and req.image_names:
        problems.append("this workflow takes no reference images")
    if img is not None:
        if len(req.image_names) < img.get("min", 0):
            problems.append(f"at least {img.get('min')} reference image(s) required")
        if len(req.image_names) > len(img.get("targets") or []):
            problems.append(f"at most {len(img.get('targets') or [])} reference images")
    lora = next((s for s in wf.slots.values() if s.get("type") == "lora"), None)
    if req.lora_names and (lora is None or len(req.lora_names) > 1):
        problems.append("at most one LoRA" if lora else "this workflow takes no LoRA")
    if req.lora_scale is not None and lora is not None and not (lora.get("minScale", 0) <= req.lora_scale <= lora.get("maxScale", 2)):
        problems.append("loraScale out of range")
    for n in [*req.image_names, *req.lora_names, req.output_prefix]:
        if not _SAFE_NAME.match(n):
            problems.append("unsafe file name")
    return problems


def bind(reg: Registry, wf: Workflow, req: BindRequest) -> tuple[dict, str]:
    """Fill the declared slots; return (bound graph, its sha256)."""
    problems = check_request(wf, req)
    if problems:
        raise SlotError(problems)
    g = copy.deepcopy(wf.graph)
    values: dict[str, Any] = {"prompt": req.prompt, "negative": req.negative if req.negative is not None else None,
                              "seed": req.seed, "width": req.width, "height": req.height, "steps": req.steps}
    for name, s in wf.slots.items():
        t = s["type"]
        if t in ("string", "int", "float"):
            v = values.get(name)
            if v is None:
                v = s.get("default")
            if v is None:
                if s.get("required"):
                    raise SlotError([f"slot {name} is required"])
                continue
            for node, inp in s["targets"]:
                g[node]["inputs"][inp] = v
        elif t == "images":
            for i, tgt in enumerate(s["targets"]):
                if i < len(req.image_names):
                    g[tgt["node"]]["inputs"]["image"] = req.image_names[i]
                else:
                    for c, inp in tgt.get("consumers") or []:
                        g[c]["inputs"].pop(inp, None)
                    g.pop(tgt["node"], None)
        elif t == "lora":
            nid = s["node"]
            if req.lora_names:
                g[nid]["inputs"]["lora_name"] = req.lora_names[0]
                g[nid]["inputs"]["strength_model"] = req.lora_scale if req.lora_scale is not None else s.get("defaultScale", 1.0)
            else:
                upstream = g[nid]["inputs"][s.get("bypassInput", "model")]
                for node in g.values():
                    for k, v in list(node.get("inputs", {}).items()):
                        if v == [nid, 0]:
                            node["inputs"][k] = upstream
                g.pop(nid)
    g[wf.output]["inputs"]["filename_prefix"] = req.output_prefix
    problems = validate_graph(g, reg.allowed_nodes, wf.output)
    if problems:
        raise SlotError(problems)
    return g, sha256_text(canonical_json(g))


def fit_size(width: int, height: int, *, multiple: int = 16, max_megapixels: float = 2.1, lo: int = 256, hi: int = 2048) -> tuple[int, int]:
    """The size a workflow accepts closest to the one asked for (same aspect)."""
    scale = min(1.0, math.sqrt(max_megapixels * 1_000_000 / max(1, width * height)))
    w, h = width * scale, height * scale
    snap = lambda v: max(lo, min(hi, int(v // multiple) * multiple))  # noqa: E731
    return snap(w), snap(h)
