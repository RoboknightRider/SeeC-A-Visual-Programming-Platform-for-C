from Classes.Node import *

class FunctionNode(Node):
    def __init__(self, fun_name, return_type="void", parameters=None, body_start=None,):
        super().__init__()
        self.fun_name = fun_name
        self.return_type = return_type
        self.parameters = parameters if parameters is not None else {}
        self.body_start = body_start

    def to_code(self):
        if self.parameters:
            params = ", ".join(f"{typ} {name}" for name, typ in self.parameters.items())
        else:
            params = ""

        code = f"{self.return_type} {self.fun_name}({params}) {{\n"

        if self.body_start:
            code += dump_body(self.body_start)
        code += "}"

        if self.next_node:
            code += self.next_node.to_code()

        return code