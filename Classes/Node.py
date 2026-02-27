from Modules.utils import *

class Node:
    _global_id_counter = 0

    def __init__(self):
        Node._global_id_counter += 1
        self.id = Node._global_id_counter

        self.next_node = None
        self.prev_node = None

    def set_next(self, next_node):
        if self.next_node:
            self.next_node.prev_node = None

        self.next_node = next_node
        next_node.prev_node = self

    def to_code(self):
        raise NotImplementedError("Subclasses must implement to_code()")