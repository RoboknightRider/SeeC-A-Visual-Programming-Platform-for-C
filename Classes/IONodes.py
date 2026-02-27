from Classes.Node import *

class PrintfNode(Node):
    def __init__(self, text):
        super().__init__()
        self.text = text

    def to_code(self):
        return f'printf("{safe_text(self.text)}");'

class GetCharNode(Node):
    def __init__(self):
        super().__init__()

    def to_code(self):
        return "getchar();"

class ReturnNode(Node):
    def __init__(self, value):
        super().__init__()
        self.value = value
    def to_code(self):
        code = f'return {self.value};'
        return code