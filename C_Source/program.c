#include <stdlib.h>
#include <stdio.h>

int main() {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);

    printf("Hello World\n");
    int x = 0;
    scanf("%d", &y);
    printf("%d\n", x);
    return 0;
}
