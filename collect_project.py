import os

# الامتدادات التي تهمنا في مشروعك (React/TypeScript/SQL)
EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.sql', '.json', '.html']

# المجلدات التي يجب تجاهلها تماماً لتجنب تضخم الملف
SKIP_DIRS = {
    'node_modules', '.git', 'dist', 'build', 'coverage', 
    '.vscode', '.idea', '__pycache__'
}

# الملفات التي يجب تجاهلها
SKIP_FILES = {
    'package-lock.json', 'yarn.lock', 'collect_project.py', 
    'full_codebase.txt', 'pnpm-lock.yaml'
}

def collect_code():
    output_file = 'full_codebase.txt'
    current_dir = os.getcwd()
    
    print(f"جاري تجميع ملفات المشروع من: {current_dir}")
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        outfile.write(f"--- PROJECT ROOT: {current_dir} ---\n")
        
        for root, dirs, files in os.walk(current_dir):
            # تعديل القائمة dirs في مكانها لتجاهل المجلدات غير المرغوبة
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            
            for file in files:
                if file in SKIP_FILES:
                    continue
                    
                # التحقق من الامتداد
                _, ext = os.path.splitext(file)
                if ext.lower() in EXTENSIONS:
                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, current_dir)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                            
                            # كتابة فاصل واسم الملف
                            outfile.write(f"\n{'='*50}\n")
                            outfile.write(f"FILE_PATH: {relative_path}\n")
                            outfile.write(f"{'='*50}\n")
                            outfile.write(content)
                            outfile.write("\n")
                            
                            print(f"تمت قراءة: {relative_path}")
                    except Exception as e:
                        print(f"فشل قراءة الملف {relative_path}: {e}")

    print(f"\nتم الانتهاء! الملف الناتج: {output_file}")
    print("يمكنك الآن رفع هذا الملف للذكاء الاصطناعي.")

if __name__ == '__main__':
    collect_code()
