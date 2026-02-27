import subprocess
import os
import shutil

def find_gcc():
    # 1. Check local folder
    local_gcc = os.path.join(os.getcwd(), "gcc", "bin", "gcc.exe")
    if os.path.exists(local_gcc):
        print("✅ Found GCC in local folder.")
        return local_gcc

    # 2. Check global PATH
    gcc_in_path = shutil.which("gcc")
    if gcc_in_path:
        print(f"✅ Found GCC in system PATH: {gcc_in_path}")
        return "gcc"

    # 3. Neither found
    print("❌ GCC compiler not found.\n"
          "Please either:\n"
          "  • Place a portable GCC in a folder named 'gcc' inside this directory\n"
          "    (e.g. ./gcc/bin/gcc.exe)\n"
          "  • OR install MinGW and add it to your PATH.")
    return None

def compile_code(code, program_name):
    gcc_path = find_gcc()
    if not gcc_path:
        return None

    # Directories
    c_dir = "C"
    exe_dir = "C_Exe"

    os.makedirs(c_dir, exist_ok=True)
    os.makedirs(exe_dir, exist_ok=True)

    # File paths
    c_filename = os.path.join(c_dir, program_name + ".c")
    exe_filename = os.path.join(exe_dir, program_name)

    if os.name == "nt":
        exe_filename += ".exe"

    # Write the C code
    with open(c_filename, "w") as f:
        f.write(code)

    print("\n🔧 Compiling...")

    # Compile using full paths
    compile_process = subprocess.run(
        [gcc_path, c_filename, "-o", exe_filename],
        capture_output=True,
        text=True
    )

    if compile_process.returncode != 0:
        print("Compilation failed:")
        print(compile_process.stderr)
        return None
    else:
        print("✅ Compilation succeeded.\n")
        return exe_filename

def execute_exe(program_name):
    if os.name == "nt":
        subprocess.run(["cmd", "/c", "start", program_name])
    else:
        subprocess.run(["./" + program_name])
