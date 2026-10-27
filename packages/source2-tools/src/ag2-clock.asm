
; Disassembly of clock.rs STUB at RVA 0x1eba000 (AMD64, Intel syntax).
; The RIP-relative load below resolves to the editor's resource-system global.
; Absolute branch targets are RVAs within the same modeldoc_editor.dll.
        mov rcx, qword ptr [rbx+0x178]
        mov rax, qword ptr [rcx]
        call qword ptr [rax+0x130]
        test al, al
        je normal
        mov rcx, qword ptr [rbx+0x178]
        mov rdx, qword ptr [rcx+0x1d8]
        test rdx, rdx
        je zero
        cmp qword ptr [rdx], 0
        je zero
        mov qword ptr [rsp+0x20], rdx
        mov rcx, qword ptr [rip-0x40cb31] ; resource-system global RVA 0x1aad508
        mov rax, qword ptr [rcx]
        call qword ptr [rax+0x30]
        cmp eax, 3
        jne zero
        mov rdx, qword ptr [rsp+0x20]
        test byte ptr [rdx+0x18], 2
        jne zero
        mov rax, qword ptr [rdx]
        test rax, rax
        je zero
        movss xmm0, dword ptr [rax+0xc]
        jmp 0x1f18d1
    zero:
        xorps xmm0, xmm0
        jmp 0x1f18d1
    normal:
        jmp 0x1f18f5
