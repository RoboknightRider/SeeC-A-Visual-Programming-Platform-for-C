#include <stdio.h>
int main() {
    int x = 6;
    int y = 6;
    if (x>5) {
        if (y>5) {
            printf("yey\n");
        } else {
            printf("Nooo\n");
        }
    } else if (x<5) {
        printf("no\n");
    } else {
        printf("nooo\n");
        printf("noooooooooooooooooo\n");
    }
    printf("Press Enter to exit...\n");
    getchar();
    return 0;
}