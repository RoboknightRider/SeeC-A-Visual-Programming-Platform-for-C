def dump_body(start):
    code = ""
    current = start
    while current:
        code += indent_block(current.to_code()) + "\n"
        current = current.next_node
    return code

def indent_block(text, level=1):
    prefix = "    " * level
    return "\n".join(prefix + line for line in text.split("\n"))

def safe_text(text):
    return text.replace("\\", "\\\\").replace("\n", "\\n")