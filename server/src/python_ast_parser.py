import ast
import json
import os
import sys

def get_signatures(node):
    signatures = []
    
    for item in node.body:
        # Classes
        if isinstance(item, ast.ClassDef):
            class_info = {
                "type": "class",
                "name": item.name,
                "doc": ast.get_docstring(item).split('\n')[0] if ast.get_docstring(item) else None,
                "methods": []
            }
            
            for subitem in item.body:
                if isinstance(subitem, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # Skip private methods if needed
                    if not subitem.name.startswith('_') or subitem.name.startswith('__'):
                        method_info = {
                            "name": subitem.name,
                            "async": isinstance(subitem, ast.AsyncFunctionDef),
                            "doc": ast.get_docstring(subitem).split('\n')[0] if ast.get_docstring(subitem) else None,
                            "decorators": [ast.unparse(d) if hasattr(ast, 'unparse') else "..." for d in subitem.decorator_list]
                        }
                        class_info["methods"].append(method_info)
            signatures.append(class_info)
            
        # Top-level Functions
        elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            func_info = {
                "type": "function",
                "name": item.name,
                "async": isinstance(item, ast.AsyncFunctionDef),
                "doc": ast.get_docstring(item).split('\n')[0] if ast.get_docstring(item) else None,
                "decorators": [ast.unparse(d) if hasattr(ast, 'unparse') else "..." for d in item.decorator_list]
            }
            signatures.append(func_info)
            
    return signatures

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        return

    filepath = sys.argv[1]
    if not os.path.exists(filepath):
        print(json.dumps({"error": f"File not found: {filepath}"}))
        return

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            source = f.read()
        
        tree = ast.parse(source)
        signatures = get_signatures(tree)
        print(json.dumps(signatures))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
