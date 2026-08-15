import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "data_analysis.py"


def run(config, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    config_path = output_dir / "config.json"
    config_path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--config", str(config_path), "--output-dir", str(output_dir)],
        capture_output=True,
        text=True,
        check=False,
    )


def main():
    output_dir = Path(tempfile.mkdtemp(prefix="paper-pet-tool-test-"))
    try:
        mechanism = run({
            "tool": "mechanism_diagram",
            "title": "数字能力影响服务可及性的机制",
            "nodes": ["数字能力", "组织协同", "服务可及性"],
            "edges": [[0, 1], [1, 2]],
        }, output_dir)
        assert mechanism.returncode == 0, mechanism.stderr
        result = json.loads(mechanism.stdout)
        assert Path(result["files"][0]).exists()

        data_path = output_dir / "sample.csv"
        data_path.write_text("a,b\n1,2\n2,3\n", encoding="utf-8")
        analysis = run({
            "tool": "data_analysis",
            "source": str(data_path),
            "chartType": "scatter",
            "x": "a",
            "y": "b",
        }, output_dir / "analysis")
        if importlib.util.find_spec("matplotlib"):
            assert analysis.returncode == 0, analysis.stderr
        else:
            assert analysis.returncode != 0
            assert "matplotlib" in json.loads(analysis.stdout)["error"]
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)

    print("data analysis tool test passed")


if __name__ == "__main__":
    main()
