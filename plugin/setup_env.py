import os
import sys
import subprocess
from pathlib import Path

def get_python_executable(venv_path):
    if os.name == 'nt':
        return venv_path / "Scripts" / "python.exe"
    else:
        return venv_path / "bin" / "python"

def run_setup(xskills_root):
    print("\n--- Preparing the Sarak Global Dependencies Environment ---")
    venv_dir = xskills_root / ".venv"
    req_file = xskills_root / "requirements.txt"
    pkg_file = xskills_root / "package.json"
    
    # 1. Configuração do Python (VENV)
    if req_file.exists():
        if not venv_dir.exists():
            print("[INFO] Creating the Python virtual environment (.venv)...")
            try:
                subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            except subprocess.CalledProcessError as e:
                print(f"[ERROR] Failed to create the venv: {e}")
                return False

        python_exe = get_python_executable(venv_dir)
        if not python_exe.exists():
            print(f"[ERROR] Python executable not found at: {python_exe}")
            return False
            
        print(f"[INFO] Installing/updating Python libraries in {venv_dir.name}...")
        try:
            subprocess.run([str(python_exe), "-m", "pip", "install", "-q", "-r", str(req_file)], check=True)
            print("[OK] Python libraries (requirements.txt) installed in Sarak Global.")
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Failed to install Python packages: {e}")
    else:
        print("[INFO] No requirements.txt found. Skipping the Python setup.")

    # 2. Configuração do Node (NPM)
    if pkg_file.exists():
        node_modules = xskills_root / "node_modules"
        print("[INFO] Checking Node dependencies (package.json)...")
        npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"
        try:
            subprocess.run([npm_cmd, "install", "--silent"], cwd=str(xskills_root), check=True)
            print("[OK] Node libraries installed in Sarak Global.")
        except FileNotFoundError:
            print("[WARNING] NPM not found on the system. Skipping the Node dependencies install.")
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Failed to run npm install: {e}")
            
    return True

if __name__ == "__main__":
    root = Path(__file__).parent.parent.resolve()
    run_setup(root)
