#include <stdio.h>

void myFunc() {
    printf("Hello Function\n");
    printf("Hello World\n");
}

int main() { setvbuf(stdout, NULL, _IONBF, 0); setvbuf(stderr, NULL, _IONBF, 0);
    printf("Hello World\n");
    myFunc();
    return 0;
}
