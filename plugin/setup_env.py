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
    print("\n--- Preparando Ambiente Global de Dependências Sarak ---")
    venv_dir = xskills_root / ".venv"
    req_file = xskills_root / "requirements.txt"
    pkg_file = xskills_root / "package.json"
    
    # 1. Configuração do Python (VENV)
    if req_file.exists():
        if not venv_dir.exists():
            print("[INFO] Criando ambiente virtual Python (.venv)...")
            try:
                subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            except subprocess.CalledProcessError as e:
                print(f"[ERRO] Falha ao criar o venv: {e}")
                return False

        python_exe = get_python_executable(venv_dir)
        if not python_exe.exists():
            print(f"[ERRO] Executável Python não encontrado em: {python_exe}")
            return False
            
        print(f"[INFO] Instalando/Atualizando bibliotecas Python em {venv_dir.name}...")
        try:
            subprocess.run([str(python_exe), "-m", "pip", "install", "-q", "-r", str(req_file)], check=True)
            print("[OK] Bibliotecas Python (requirements.txt) instaladas no Sarak Global.")
        except subprocess.CalledProcessError as e:
            print(f"[ERRO] Falha ao instalar pacotes Python: {e}")
    else:
        print("[INFO] Nenhum requirements.txt encontrado. Pulando setup Python.")

    # 2. Configuração do Node (NPM)
    if pkg_file.exists():
        node_modules = xskills_root / "node_modules"
        print("[INFO] Checando dependências Node (package.json)...")
        npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"
        try:
            subprocess.run([npm_cmd, "install", "--silent"], cwd=str(xskills_root), check=True)
            print("[OK] Bibliotecas Node instaladas no Sarak Global.")
        except FileNotFoundError:
            print("[AVISO] NPM não encontrado no sistema. Pulando instalação de dependências Node.")
        except subprocess.CalledProcessError as e:
            print(f"[ERRO] Falha ao rodar npm install: {e}")
            
    return True

if __name__ == "__main__":
    root = Path(__file__).parent.parent.resolve()
    run_setup(root)
