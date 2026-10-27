// Reproduce the pinned CLI's old ofstream mechanism, without any model or audio.
#include <cstdio>
#include <fstream>
#include <string>
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    if (std::string(argv[1]) == "legacy") {
        std::ofstream out{"/dev/stdout"};
        out << "synthetic-stdout-probe";
        return 0; // The pinned CLI also did not check this open/write failure.
    }
    if (std::string(argv[1]) == "direct") {
        return std::fputs("synthetic-stdout-probe", stdout) < 0 ? 1 : 0;
    }
    return 2;
}
