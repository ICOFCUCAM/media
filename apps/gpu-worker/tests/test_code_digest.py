from pathlib import Path

from app import code_digest as cd

APP = Path(cd.__file__).resolve().parent


def test_digest_is_stable_and_ignores_pycache(tmp_path):
    (tmp_path / "pkg").mkdir()
    (tmp_path / "a.py").write_text("x = 1\n")
    (tmp_path / "pkg" / "b.py").write_text("y = 2\n")
    first = cd.code_digest(tmp_path)
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "a.cpython-311.py").write_text("junk")
    (tmp_path / "notes.txt").write_text("not code")
    assert cd.code_digest(tmp_path) == first
    assert [rel for rel, _ in cd.file_hashes(tmp_path)] == ["a.py", "pkg/b.py"]


def test_any_byte_change_or_rename_changes_digest(tmp_path):
    (tmp_path / "a.py").write_text("x = 1\n")
    base = cd.code_digest(tmp_path)
    (tmp_path / "a.py").write_text("x = 2\n")
    assert cd.code_digest(tmp_path) != base
    (tmp_path / "a.py").rename(tmp_path / "c.py")
    assert cd.code_digest(tmp_path) not in {base}


def test_server_reports_digest_of_loaded_code(signing_key, mint):
    from tests.test_server import build_client

    client, _, _ = build_client(signing_key)
    with client:
        c = client.get("/capabilities", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"})
    assert c.json()["image"]["codeSha256"] == cd.code_digest(APP)


def test_cli_prints_digest(capsys, tmp_path):
    (tmp_path / "a.py").write_text("x = 1\n")
    assert cd.main([str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip() == cd.code_digest(tmp_path)
