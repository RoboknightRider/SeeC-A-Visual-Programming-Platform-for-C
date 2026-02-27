from Classes.Node import *

class VariableDeclarationNode(Node):
    def __init__(self, var_type, var_name, value=None):
        super().__init__()
        self.var_type = var_type
        self.var_name = var_name
        self.value = value

    def to_code(self):
        if self.value is None:
            return f"{self.var_type} {self.var_name};"
        else:
            if isinstance(self.value, str):
                return f'{self.var_type} {self.var_name} = "{safe_text(self.value)}";'
            else:
                return f"{self.var_type} {self.var_name} = {self.value};"