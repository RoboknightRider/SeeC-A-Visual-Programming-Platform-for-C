from Classes.Node import *

class IfNode(Node):
    def __init__(self, condition, body_start=None, chain_next=None):
        super().__init__()
        self.condition = condition
        self.body_start = body_start
        self.chain_next = chain_next    # can be ElseIfNode or ElseNode

    def to_code(self):
        code = f"if ({self.condition}) {{\n"
        code += dump_body(self.body_start)
        code += "}"

        if self.chain_next:
            code += " " + self.chain_next.to_code()

        return code

class ElseIfNode(Node):
    def __init__(self, condition, body_start=None, chain_next=None):
        super().__init__()
        self.condition = condition
        self.body_start = body_start
        self.chain_next = chain_next

    def to_code(self):
        code = f"else if ({self.condition}) {{\n"
        code += dump_body(self.body_start)
        code += "}"

        if self.chain_next:
            code += " " + self.chain_next.to_code()

        return code

class ElseNode(Node):
    def __init__(self, body_start=None):
        super().__init__()
        self.body_start = body_start

    def to_code(self):
        code = "else {\n"
        code += dump_body(self.body_start)
        code += "}"
        return code