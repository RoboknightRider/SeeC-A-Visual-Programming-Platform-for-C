from Modules.CompilerHelpers import *
from Classes.IfNodes import *
from Classes.VariablesNode import *
from Classes.FunctionNode import *
from Classes.IONodes import *
from Modules.utils import *

# C source code (replace this as needed)
VariableX = VariableDeclarationNode("int", "x", 6)
VariableY = VariableDeclarationNode("int", "y", 6)
VariableX.set_next(VariableY)

IfNode1 = IfNode("x>5")
VariableY.set_next(IfNode1)

NestedIfNode1 = IfNode("y>5")
IfNode1.body_start = NestedIfNode1
NestedElseNode1 = ElseNode()
NestedIfNode1.chain_next = NestedElseNode1
PrintNoo = PrintfNode("Nooo\n")
NestedElseNode1.body_start = PrintNoo
PrintYay = PrintfNode("yey\n")
NestedIfNode1.body_start = PrintYay

ElseIfNode1 = ElseIfNode("x<5")
IfNode1.chain_next = ElseIfNode1
ElseIfNode1.body_start = PrintfNode("no\n")

ElseNode1 = ElseNode()
ElseIfNode1.chain_next = ElseNode1
ElseBodyPrint1 = PrintfNode("nooo\n")
ElseNode1.body_start = ElseBodyPrint1
ElseBodyPrint2 = PrintfNode("noooooooooooooooooo\n")
ElseBodyPrint1.set_next(ElseBodyPrint2)

PrintfNode1 = PrintfNode("Press Enter to exit...\n")
IfNode1.set_next(PrintfNode1)

GetCharNode1 = GetCharNode()
PrintfNode1.set_next(GetCharNode1)

ReturnNode = ReturnNode("0")
GetCharNode1.set_next(ReturnNode)

FunctionNode1 = FunctionNode("main", "int")
FunctionNode1.body_start = VariableX

c_code = "#include <stdio.h>\n"
c_code += FunctionNode1.to_code()
print(c_code)

# ---- Run everything ----
Exe = compile_code(c_code, "Example")
if Exe:
    execute_exe(Exe)