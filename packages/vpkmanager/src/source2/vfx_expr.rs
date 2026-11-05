// SPDX-FileCopyrightText: 2026 esoc
// SPDX-License-Identifier: MIT
// Adapted from Slush97/vpkmerge d70672e96a433cfcc507eab3b2808cc4d74dc693.
//! Source 2 dynamic-expression compiler.
//!
//! Materials (`.vmat_c`) can drive almost any shader param per frame from a
//! small expression language ("dynamic expressions"): `$ent_health < .4 ?
//! float3(1,0,0) : float3(1,1,1)`. The engine stores them compiled to a tiny
//! stack-machine bytecode in `m_dynamicParams` / `m_dynamicTextureParams`.
//! This module is both halves: [`compile`] source -> bytecode and
//! [`decompile`] bytecode -> source. `ValveResourceFormat`'s `VfxEval` is the
//! reference decompiler both are checked against (opcode table and encoding
//! lifted from there, verified byte-identical against shipped Deadlock
//! materials). `compile(decompile(blob)) == blob` holds for every shipped
//! pak01 expression inside the grammar below.
//!
//! Supported grammar: float literals, attribute reads (`$name`, or any bare
//! identifier not followed by `(`), the fixed built-in function table
//! (`sin`..`RemapValClamped`), arithmetic `+ - * / %`, comparisons,
//! `&& || !`, ternary `?:`, unary minus, swizzles (`.xyz`), `exists($x)`,
//! and parentheses. No local variables / multi-statement input: a compiled
//! blob is one expression terminated by `RETURN`.

use std::fmt;

/// Compilation error with a human-readable message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExprError(String);

impl fmt::Display for ExprError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "dynamic expression: {}", self.0)
    }
}

impl std::error::Error for ExprError {}

fn err<T>(msg: impl Into<String>) -> Result<T, ExprError> {
    Err(ExprError(msg.into()))
}

/// `MurmurHash2` (32-bit, Austin Appleby variant) with Valve's string-token
/// seed. Attribute names are hashed lowercased, `$` included.
#[must_use]
pub fn murmur2(data: &[u8], seed: u32) -> u32 {
    const M: u32 = 0x5bd1_e995;
    let mut h = seed ^ u32::try_from(data.len()).unwrap_or(u32::MAX);
    let (chunks, rem) = data.as_chunks::<4>();
    for c in chunks {
        let mut k = u32::from_le_bytes(*c);
        k = k.wrapping_mul(M);
        k ^= k >> 24;
        k = k.wrapping_mul(M);
        h = h.wrapping_mul(M);
        h ^= k;
    }
    if rem.len() >= 3 {
        h ^= u32::from(rem[2]) << 16;
    }
    if rem.len() >= 2 {
        h ^= u32::from(rem[1]) << 8;
    }
    if !rem.is_empty() {
        h ^= u32::from(rem[0]);
        h = h.wrapping_mul(M);
    }
    h ^= h >> 13;
    h = h.wrapping_mul(M);
    h ^= h >> 15;
    h
}

/// Valve's seed for render-attribute string tokens (`StringToken` in VRF).
pub const STRING_TOKEN_SEED: u32 = 0x3141_5926;

/// The string token the engine matches a render attribute by: murmur2 of the
/// lowercased name (leading `$` participates in the hash).
#[must_use]
pub fn attribute_token(name: &str) -> u32 {
    murmur2(name.to_ascii_lowercase().as_bytes(), STRING_TOKEN_SEED)
}

/// Fixed built-in function table; index in this list is the bytecode id.
/// Order is load-bearing (must match the engine / VRF `FUNCTION_REF`).
const FUNCTIONS: &[(&str, usize)] = &[
    ("sin", 1),
    ("cos", 1),
    ("tan", 1),
    ("frac", 1),
    ("floor", 1),
    ("ceil", 1),
    ("saturate", 1),
    ("clamp", 3),
    ("lerp", 3),
    ("dot4", 2),
    ("dot3", 2),
    ("dot2", 2),
    ("log", 1),
    ("log2", 1),
    ("log10", 1),
    ("exp", 1),
    ("exp2", 1),
    ("sqrt", 1),
    ("rsqrt", 1),
    ("sign", 1),
    ("abs", 1),
    ("pow", 2),
    ("step", 2),
    ("smoothstep", 3),
    ("float4", 4),
    ("float3", 3),
    ("float2", 2),
    ("time", 0),
    ("min", 2),
    ("max", 2),
    ("srgblineartogamma", 1),
    ("srgbgammatolinear", 1),
    ("random", 2),
    ("normalize", 1),
    ("length", 1),
    ("sqr", 1),
    ("rotation2d", 1),
    ("rotate2d", 2),
    ("sincos", 1),
    ("texturesize", 1),
    ("textureaveragecolor", 1),
    ("matrixidentity", 0),
    ("matrixscale", 1),
    ("matrixtranslate", 1),
    ("matrixaxisangle", 1),
    ("matrixaxistoaxis", 2),
    ("matrixmultiply", 2),
    ("matrixcolorcorrect", 1),
    ("matrixcolorcorrect2", 2),
    ("matrixcolortint", 1),
    ("normalize_safe", 1),
    ("remap01scaleoffset", 1),
    ("radians", 1),
    ("degrees", 1),
    ("matrixcolortint2", 2),
    ("matrixcolortint3", 3),
    ("remapval", 5),
    ("remapvalclamped", 5),
];

mod op {
    pub const RETURN: u8 = 0x00;
    pub const JUMP: u8 = 0x02;
    pub const BRANCH: u8 = 0x04;
    pub const FUNC: u8 = 0x06;
    pub const FLOAT: u8 = 0x07;
    pub const NOT: u8 = 0x0C;
    pub const EQUALS: u8 = 0x0D;
    pub const NEQUALS: u8 = 0x0E;
    pub const GT: u8 = 0x0F;
    pub const GTE: u8 = 0x10;
    pub const LT: u8 = 0x11;
    pub const LTE: u8 = 0x12;
    pub const ADD: u8 = 0x13;
    pub const SUB: u8 = 0x14;
    pub const MUL: u8 = 0x15;
    pub const DIV: u8 = 0x16;
    pub const MODULO: u8 = 0x17;
    pub const NEGATE: u8 = 0x18;
    pub const ATTRIBUTE: u8 = 0x19;
    pub const SWIZZLE: u8 = 0x1E;
    pub const EXISTS: u8 = 0x1F;
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Float(f32),
    /// Identifier (function name or bare attribute). Lowercased.
    Ident(String),
    /// `$name` attribute reference, `$` retained.
    Attr(String),
    /// `.xyz` swizzle suffix.
    Swizzle(String),
    LParen,
    RParen,
    Comma,
    Question,
    Colon,
    OrOr,
    AndAnd,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Bang,
}

#[allow(clippy::too_many_lines)] // one flat token match; splitting hurts readability
fn lex(src: &str) -> Result<Vec<Tok>, ExprError> {
    let b = src.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        match c {
            b' ' | b'\t' | b'\r' | b'\n' => i += 1,
            b'(' => {
                out.push(Tok::LParen);
                i += 1;
            }
            b')' => {
                out.push(Tok::RParen);
                i += 1;
            }
            b',' => {
                out.push(Tok::Comma);
                i += 1;
            }
            b'?' => {
                out.push(Tok::Question);
                i += 1;
            }
            b':' => {
                out.push(Tok::Colon);
                i += 1;
            }
            b'+' => {
                out.push(Tok::Plus);
                i += 1;
            }
            b'-' => {
                out.push(Tok::Minus);
                i += 1;
            }
            b'*' => {
                out.push(Tok::Star);
                i += 1;
            }
            b'/' => {
                out.push(Tok::Slash);
                i += 1;
            }
            b'%' => {
                out.push(Tok::Percent);
                i += 1;
            }
            b'|' | b'&' => {
                if i + 1 >= b.len() || b[i + 1] != c {
                    return err(format!("single '{}' (use '{0}{0}')", c as char));
                }
                out.push(if c == b'|' { Tok::OrOr } else { Tok::AndAnd });
                i += 2;
            }
            b'=' => {
                if i + 1 < b.len() && b[i + 1] == b'=' {
                    out.push(Tok::Eq);
                    i += 2;
                } else {
                    return err("assignment is not supported (use '==')");
                }
            }
            b'!' => {
                if i + 1 < b.len() && b[i + 1] == b'=' {
                    out.push(Tok::Ne);
                    i += 2;
                } else {
                    out.push(Tok::Bang);
                    i += 1;
                }
            }
            b'<' => {
                if i + 1 < b.len() && b[i + 1] == b'=' {
                    out.push(Tok::Le);
                    i += 2;
                } else {
                    out.push(Tok::Lt);
                    i += 1;
                }
            }
            b'>' => {
                if i + 1 < b.len() && b[i + 1] == b'=' {
                    out.push(Tok::Ge);
                    i += 2;
                } else {
                    out.push(Tok::Gt);
                    i += 1;
                }
            }
            b'$' => {
                let start = i;
                i += 1;
                while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                    i += 1;
                }
                if i == start + 1 {
                    return err("'$' with no attribute name");
                }
                out.push(Tok::Attr(src[start..i].to_ascii_lowercase()));
            }
            b'.' => {
                // Either a swizzle (after an expression) or a leading-dot
                // float like `.5`. Disambiguate on the next byte.
                if i + 1 < b.len() && b[i + 1].is_ascii_digit() {
                    let (tok, next) = lex_float(src, i)?;
                    out.push(tok);
                    i = next;
                } else {
                    let start = i + 1;
                    let mut j = start;
                    while j < b.len()
                        && matches!(b[j].to_ascii_lowercase(), b'x' | b'y' | b'z' | b'w')
                    {
                        j += 1;
                    }
                    if j == start || j - start > 4 {
                        return err("expected swizzle of 1-4 lanes from [xyzw] after '.'");
                    }
                    out.push(Tok::Swizzle(src[start..j].to_ascii_lowercase()));
                    i = j;
                }
            }
            b'0'..=b'9' => {
                let (tok, next) = lex_float(src, i)?;
                out.push(tok);
                i = next;
            }
            _ if c.is_ascii_alphabetic() || c == b'_' => {
                let start = i;
                while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                    i += 1;
                }
                out.push(Tok::Ident(src[start..i].to_ascii_lowercase()));
            }
            _ => return err(format!("unexpected character '{}'", c as char)),
        }
    }
    Ok(out)
}

fn lex_float(src: &str, start: usize) -> Result<(Tok, usize), ExprError> {
    let b = src.as_bytes();
    let mut i = start;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    if i < b.len() && b[i] == b'.' {
        i += 1;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
    }
    // exponent form, rare but cheap to accept
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut j = i + 1;
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            j += 1;
        }
        if j < b.len() && b[j].is_ascii_digit() {
            i = j;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
        }
    }
    let text = &src[start..i];
    match text.parse::<f32>() {
        Ok(v) => Ok((Tok::Float(v), i)),
        Err(_) => err(format!("bad float literal '{text}'")),
    }
}

/// Parser + emitter. Branch operands are absolute byte offsets in the blob,
/// so emission happens directly into the output buffer with backpatching.
struct Compiler {
    toks: Vec<Tok>,
    pos: usize,
    out: Vec<u8>,
    attrs: Vec<String>,
}

impl Compiler {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn bump(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }

    fn eat(&mut self, t: &Tok) -> bool {
        if self.peek() == Some(t) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn expect(&mut self, t: &Tok, what: &str) -> Result<(), ExprError> {
        if self.eat(t) {
            Ok(())
        } else {
            err(format!("expected {what}"))
        }
    }

    fn offset(&self) -> Result<u16, ExprError> {
        u16::try_from(self.out.len()).map_or_else(|_| err("expression too long"), Ok)
    }

    fn patch_u16(&mut self, at: usize, v: u16) {
        self.out[at..at + 2].copy_from_slice(&v.to_le_bytes());
    }

    fn emit_float(&mut self, v: f32) {
        self.out.push(op::FLOAT);
        self.out.extend_from_slice(&v.to_le_bytes());
    }

    fn emit_attribute(&mut self, name: &str) {
        self.out.push(op::ATTRIBUTE);
        self.out
            .extend_from_slice(&attribute_token(name).to_le_bytes());
        if !self.attrs.iter().any(|a| a == name) {
            self.attrs.push(name.to_string());
        }
    }

    // ternary / && / || all compile to the same BRANCH+JUMP scaffold; Valve's
    // compiler puts the boolean-literal arm first for &&/|| (VRF detects that
    // exact shape) and the true-arm first for ?: .
    //
    //   <cond>
    //   BRANCH p_true p_false
    //   <first block>            (?: true arm; &&/|| the 0/1 literal)
    //   JUMP exit-1
    //   <second block>
    //   exit:
    fn ternary(&mut self) -> Result<(), ExprError> {
        self.logic_or()?;
        if !self.eat(&Tok::Question) {
            return Ok(());
        }
        let operands = self.begin_branch();
        self.ternary()?; // true arm
        let jump_operand = self.begin_jump();
        self.expect(&Tok::Colon, "':' in ternary")?;
        let p_false = self.offset()?;
        self.ternary()?; // false arm
        self.finish_branch(operands, None, Some(p_false), jump_operand)
    }

    fn logic_or(&mut self) -> Result<(), ExprError> {
        self.logic_and()?;
        while self.eat(&Tok::OrOr) {
            let operands = self.begin_branch();
            let p_true = self.offset()?;
            self.emit_float(1.0);
            let jump_operand = self.begin_jump();
            let p_false = self.offset()?;
            self.logic_and()?;
            self.finish_branch(operands, Some(p_true), Some(p_false), jump_operand)?;
        }
        Ok(())
    }

    fn logic_and(&mut self) -> Result<(), ExprError> {
        self.equality()?;
        while self.eat(&Tok::AndAnd) {
            let operands = self.begin_branch();
            let p_false = self.offset()?;
            self.emit_float(0.0);
            let jump_operand = self.begin_jump();
            let p_true = self.offset()?;
            self.equality()?;
            self.finish_branch(operands, Some(p_true), Some(p_false), jump_operand)?;
        }
        Ok(())
    }

    /// Emits `BRANCH` with placeholder operands; returns the operand offset.
    fn begin_branch(&mut self) -> usize {
        self.out.push(op::BRANCH);
        let at = self.out.len();
        self.out.extend_from_slice(&[0; 4]);
        at
    }

    /// Emits `JUMP` with a placeholder operand; returns the operand offset.
    fn begin_jump(&mut self) -> usize {
        self.out.push(op::JUMP);
        let at = self.out.len();
        self.out.extend_from_slice(&[0; 2]);
        at
    }

    /// Backpatches one BRANCH+JUMP scaffold. `p_true` defaults to the byte
    /// after the BRANCH operands (the ?: layout).
    fn finish_branch(
        &mut self,
        operands: usize,
        p_true: Option<u16>,
        p_false: Option<u16>,
        jump_operand: usize,
    ) -> Result<(), ExprError> {
        let exit = self.offset()?;
        let after_branch =
            u16::try_from(operands + 4).map_or_else(|_| err("expression too long"), Ok)?;
        let p_true = p_true.unwrap_or(after_branch);
        let p_false = p_false.ok_or_else(|| ExprError("internal: missing false target".into()))?;
        self.patch_u16(operands, p_true);
        self.patch_u16(operands + 2, p_false);
        // the JUMP lands on the first instruction after the second block
        // (VRF's decompiler folds the branch when it reads the byte there)
        self.patch_u16(jump_operand, exit);
        Ok(())
    }

    fn binary_level(
        &mut self,
        next: fn(&mut Self) -> Result<(), ExprError>,
        table: &[(Tok, u8)],
    ) -> Result<(), ExprError> {
        next(self)?;
        'outer: loop {
            for (tok, opcode) in table {
                if self.eat(tok) {
                    next(self)?;
                    self.out.push(*opcode);
                    continue 'outer;
                }
            }
            return Ok(());
        }
    }

    fn equality(&mut self) -> Result<(), ExprError> {
        self.binary_level(
            Self::relational,
            &[(Tok::Eq, op::EQUALS), (Tok::Ne, op::NEQUALS)],
        )
    }

    fn relational(&mut self) -> Result<(), ExprError> {
        self.binary_level(
            Self::additive,
            &[
                (Tok::Le, op::LTE),
                (Tok::Ge, op::GTE),
                (Tok::Lt, op::LT),
                (Tok::Gt, op::GT),
            ],
        )
    }

    fn additive(&mut self) -> Result<(), ExprError> {
        self.binary_level(
            Self::multiplicative,
            &[(Tok::Plus, op::ADD), (Tok::Minus, op::SUB)],
        )
    }

    fn multiplicative(&mut self) -> Result<(), ExprError> {
        self.binary_level(
            Self::unary,
            &[
                (Tok::Star, op::MUL),
                (Tok::Slash, op::DIV),
                (Tok::Percent, op::MODULO),
            ],
        )
    }

    fn unary(&mut self) -> Result<(), ExprError> {
        if self.eat(&Tok::Minus) {
            // Valve's compiler never folds a negative literal: `-1` is always
            // `FLOAT 1.0; NEGATE`, in every position (leading, inside float2,
            // etc. -- confirmed against shipped pak01 blobs). Match that so the
            // output stays byte-identical and decompile round-trips.
            self.unary()?;
            self.out.push(op::NEGATE);
            return Ok(());
        }
        if self.eat(&Tok::Bang) {
            self.unary()?;
            self.out.push(op::NOT);
            return Ok(());
        }
        self.postfix()
    }

    fn postfix(&mut self) -> Result<(), ExprError> {
        self.primary()?;
        self.postfix_after_primary()
    }

    fn postfix_after_primary(&mut self) -> Result<(), ExprError> {
        while let Some(Tok::Swizzle(s)) = self.peek().cloned() {
            self.pos += 1;
            self.out.push(op::SWIZZLE);
            self.out.push(pack_swizzle(&s)?);
        }
        Ok(())
    }

    fn primary(&mut self) -> Result<(), ExprError> {
        match self.bump() {
            Some(Tok::Float(v)) => {
                self.emit_float(v);
                Ok(())
            }
            Some(Tok::Attr(name)) => {
                self.emit_attribute(&name);
                Ok(())
            }
            Some(Tok::LParen) => {
                self.ternary()?;
                self.expect(&Tok::RParen, "')'")
            }
            Some(Tok::Ident(name)) => {
                if self.peek() == Some(&Tok::LParen) {
                    self.pos += 1;
                    self.call(&name)
                } else {
                    // bare identifier: an attribute without '$' (the editor
                    // treats any unknown word the same way)
                    self.emit_attribute(&name);
                    Ok(())
                }
            }
            other => err(format!("expected a value, got {other:?}")),
        }
    }

    fn call(&mut self, name: &str) -> Result<(), ExprError> {
        if name == "exists" {
            let arg = self.bump();
            let Some(Tok::Attr(attr) | Tok::Ident(attr)) = arg else {
                return err("exists() takes one attribute name");
            };
            self.expect(&Tok::RParen, "')' after exists()")?;
            self.out.push(op::EXISTS);
            self.out
                .extend_from_slice(&attribute_token(&attr).to_le_bytes());
            if !self.attrs.iter().any(|a| a == &attr) {
                self.attrs.push(attr);
            }
            return Ok(());
        }

        let Some(id) = FUNCTIONS.iter().position(|(n, _)| *n == name) else {
            return err(format!("unknown function '{name}'"));
        };
        let arity = FUNCTIONS[id].1;
        let mut got = 0;
        if !self.eat(&Tok::RParen) {
            loop {
                self.ternary()?;
                got += 1;
                if self.eat(&Tok::RParen) {
                    break;
                }
                self.expect(&Tok::Comma, "',' or ')' in argument list")?;
            }
        }
        if got != arity {
            return err(format!("{name}() takes {arity} argument(s), got {got}"));
        }
        self.out.push(op::FUNC);
        self.out
            .push(u8::try_from(id).expect("function table fits a byte"));
        self.out.push(0);
        Ok(())
    }
}

fn pack_swizzle(s: &str) -> Result<u8, ExprError> {
    let lane = |c: u8| -> Result<u8, ExprError> {
        match c {
            b'x' => Ok(0),
            b'y' => Ok(1),
            b'z' => Ok(2),
            b'w' => Ok(3),
            _ => err("swizzle lanes must be x/y/z/w"),
        }
    };
    let b = s.as_bytes();
    if b.is_empty() || b.len() > 4 {
        return err("swizzle must have 1-4 lanes");
    }
    let mut packed = 0u8;
    for i in 0..4 {
        // pad with the last lane, matching how the editor packs short swizzles
        let c = b[i.min(b.len() - 1)];
        packed |= lane(c)? << (i * 2);
    }
    Ok(packed)
}

/// Compiled output: the bytecode plus every attribute name the expression
/// reads (callers register these in the material's `m_renderAttributesUsed`).
#[derive(Debug, Clone, PartialEq)]
pub struct CompiledExpr {
    pub bytecode: Vec<u8>,
    pub attributes: Vec<String>,
}

/// Compiles one dynamic expression to engine bytecode.
///
/// # Errors
/// Returns [`ExprError`] on any lex/parse/arity problem; never panics on
/// malformed input.
pub fn compile(src: &str) -> Result<CompiledExpr, ExprError> {
    let toks = lex(src)?;
    if toks.is_empty() {
        return err("empty expression");
    }
    let mut c = Compiler {
        toks,
        pos: 0,
        out: Vec::new(),
        attrs: Vec::new(),
    };
    c.ternary()?;
    if c.pos != c.toks.len() {
        return err(format!("trailing input at token {:?}", c.toks[c.pos]));
    }
    c.out.push(op::RETURN);
    Ok(CompiledExpr {
        bytecode: c.out,
        attributes: c.attrs,
    })
}

// ---------------------------------------------------------------------------
// Decompiler: bytecode -> source, the inverse of `compile`.
// ---------------------------------------------------------------------------

/// Operator precedence levels, used only to decide where to parenthesize the
/// reconstructed source. Higher binds tighter. Redundant parens never change
/// the recompiled bytecode (parens emit nothing), but *missing* parens would,
/// so the round-trip test (`compile(decompile(b)) == b`) is the real gate.
mod prec {
    pub const TERNARY: u8 = 1;
    pub const OR: u8 = 2;
    pub const AND: u8 = 3;
    pub const EQUALITY: u8 = 4;
    pub const RELATIONAL: u8 = 5;
    pub const ADDITIVE: u8 = 6;
    pub const MULTIPLICATIVE: u8 = 7;
    pub const UNARY: u8 = 8;
    pub const ATOM: u8 = 9;
}

/// A reconstructed sub-expression plus the precedence of its outermost
/// operator, so a parent knows whether to wrap it in parens.
#[derive(Clone)]
struct Frag {
    text: String,
    prec: u8,
}

impl Frag {
    fn atom(text: String) -> Self {
        Self {
            text,
            prec: prec::ATOM,
        }
    }

    /// Render this fragment, wrapping in parens if its precedence is below the
    /// `floor` the parent requires at that operand position.
    fn wrapped(&self, floor: u8) -> String {
        if self.prec < floor {
            format!("({})", self.text)
        } else {
            self.text.clone()
        }
    }
}

/// Where a `run` over a byte range should stop.
#[derive(Clone, Copy, PartialEq)]
enum Stop {
    /// Top level: stop at `RETURN`.
    Return,
    /// A ternary true-arm: stop at the first top-level `JUMP`.
    Jump,
    /// A ternary false-arm / `&&`/`||` right-hand side: stop at this offset.
    At(usize),
}

/// Format an `f32` so it parses back to the identical bit pattern. Rust's
/// default float formatting already round-trips; we only special-case integers
/// to drop the trailing `.0` for readability (`30` not `30.0`), which still
/// recompiles to the same `FLOAT` bytes.
#[allow(clippy::cast_possible_truncation)] // guarded: integral, finite, < 1e15
fn fmt_float(v: f32) -> String {
    if v.is_finite() && v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        let s = format!("{v}");
        // `{}` can emit exponent form (e.g. `1e-5`); the lexer accepts it.
        s
    }
}

/// Unpack a swizzle byte (2 bits/lane, 4 lanes) into a lane string, trimming a
/// trailing run that just repeats the last distinct lane (the compiler pads
/// short swizzles that way, so `.xy` and `.xyyy` encode identically; either
/// recompiles to the same byte).
fn unpack_swizzle(packed: u8) -> String {
    let lanes: [u8; 4] = [
        packed & 3,
        (packed >> 2) & 3,
        (packed >> 4) & 3,
        (packed >> 6) & 3,
    ];
    let names = *b"xyzw";
    let mut len = 4;
    while len > 1 && lanes[len - 1] == lanes[len - 2] {
        len -= 1;
    }
    lanes[..len]
        .iter()
        .map(|&l| names[l as usize] as char)
        .collect()
}

/// Decompiler state: the bytecode plus the token -> attribute-name map built
/// from the material's `m_renderAttributesUsed`.
struct Decompiler<'a> {
    code: &'a [u8],
    names: std::collections::HashMap<u32, String>,
}

impl Decompiler<'_> {
    fn u16_at(&self, at: usize) -> Result<usize, ExprError> {
        let b = self
            .code
            .get(at..at + 2)
            .ok_or_else(|| ExprError("truncated branch operand".into()))?;
        Ok(usize::from(u16::from_le_bytes([b[0], b[1]])))
    }

    fn u32_at(&self, at: usize) -> Result<u32, ExprError> {
        let b = self
            .code
            .get(at..at + 4)
            .ok_or_else(|| ExprError("truncated operand".into()))?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn f32_at(&self, at: usize) -> Result<f32, ExprError> {
        let b = self
            .code
            .get(at..at + 4)
            .ok_or_else(|| ExprError("truncated float operand".into()))?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn attr_name(&self, token: u32) -> Result<String, ExprError> {
        self.names.get(&token).cloned().ok_or_else(|| {
            ExprError(format!(
                "attribute token {token:#010x} not in the name table \
                 (pass the material's m_renderAttributesUsed)"
            ))
        })
    }

    /// Run the stack machine over the bytecode starting at `pos`, stopping per
    /// `stop`. Returns the single reconstructed value and the position after
    /// the consumed range (for `Stop::Jump`, the position *of* the JUMP).
    #[allow(clippy::too_many_lines)]
    fn run(&self, mut pos: usize, stop: Stop) -> Result<(Frag, usize), ExprError> {
        let mut stack: Vec<Frag> = Vec::new();
        let pop = |s: &mut Vec<Frag>| s.pop().ok_or_else(|| ExprError("stack underflow".into()));

        loop {
            if let Stop::At(end) = stop {
                if pos == end {
                    break;
                }
                if pos > end {
                    return err("branch overran its range");
                }
            }
            let op = *self
                .code
                .get(pos)
                .ok_or_else(|| ExprError("unexpected end of bytecode".into()))?;
            match op {
                op::RETURN => {
                    if stop == Stop::Return {
                        pos += 1;
                        break;
                    }
                    return err("unexpected RETURN");
                }
                op::JUMP => {
                    if stop == Stop::Jump {
                        break; // leave pos at the JUMP; caller reads its target
                    }
                    return err("unexpected JUMP");
                }
                op::FLOAT => {
                    let v = self.f32_at(pos + 1)?;
                    let prec = if v < 0.0 { prec::UNARY } else { prec::ATOM };
                    stack.push(Frag {
                        text: fmt_float(v),
                        prec,
                    });
                    pos += 5;
                }
                op::ATTRIBUTE => {
                    let name = self.attr_name(self.u32_at(pos + 1)?)?;
                    stack.push(Frag::atom(name));
                    pos += 5;
                }
                op::EXISTS => {
                    let name = self.attr_name(self.u32_at(pos + 1)?)?;
                    stack.push(Frag::atom(format!("exists({name})")));
                    pos += 5;
                }
                op::SWIZZLE => {
                    let packed = *self
                        .code
                        .get(pos + 1)
                        .ok_or_else(|| ExprError("truncated swizzle".into()))?;
                    let base = pop(&mut stack)?;
                    stack.push(Frag::atom(format!(
                        "{}.{}",
                        base.wrapped(prec::ATOM),
                        unpack_swizzle(packed)
                    )));
                    pos += 2;
                }
                op::NOT | op::NEGATE => {
                    let sym = if op == op::NOT { "!" } else { "-" };
                    let operand = pop(&mut stack)?;
                    stack.push(Frag {
                        text: format!("{sym}{}", operand.wrapped(prec::UNARY)),
                        prec: prec::UNARY,
                    });
                    pos += 1;
                }
                op::FUNC => {
                    let id = *self
                        .code
                        .get(pos + 1)
                        .ok_or_else(|| ExprError("truncated FUNC".into()))?
                        as usize;
                    let (name, arity) = *FUNCTIONS
                        .get(id)
                        .ok_or_else(|| ExprError(format!("unknown function id {id}")))?;
                    if stack.len() < arity {
                        return err(format!(
                            "{name}() wants {arity} args, stack has {}",
                            stack.len()
                        ));
                    }
                    let args: Vec<Frag> = stack.split_off(stack.len() - arity);
                    let inner = args
                        .iter()
                        .map(|a| a.wrapped(prec::TERNARY))
                        .collect::<Vec<_>>()
                        .join(",");
                    stack.push(Frag::atom(format!("{name}({inner})")));
                    pos += 3;
                }
                op::BRANCH => {
                    let frag = self.branch(&mut stack, &mut pos)?;
                    stack.push(frag);
                }
                _ => {
                    if let Some((sym, p)) = binop(op) {
                        let rhs = pop(&mut stack)?;
                        let lhs = pop(&mut stack)?;
                        // left-associative: right operand needs parens at equal
                        // precedence, left operand only when strictly lower.
                        stack.push(Frag {
                            text: format!("{} {sym} {}", lhs.wrapped(p), rhs.wrapped(p + 1)),
                            prec: p,
                        });
                        pos += 1;
                    } else {
                        return err(format!("unknown opcode {op:#04x} at {pos}"));
                    }
                }
            }
        }

        if stack.len() != 1 {
            return err(format!("expected one value, got {}", stack.len()));
        }
        Ok((stack.pop().unwrap(), pos))
    }

    /// Handle a `BRANCH` (the condition is already on `stack`). Reconstructs
    /// `&&`, `||`, or `?:` by matching the exact scaffolds `compile` emits, and
    /// advances `pos` past the whole construct.
    // The 0.0/1.0 checks are exact by design: they recognize the literal bytes
    // `compile` plants for the short-circuit arms, not approximate values.
    #[allow(clippy::float_cmp)]
    fn branch(&self, stack: &mut Vec<Frag>, pos: &mut usize) -> Result<Frag, ExprError> {
        let p_true = self.u16_at(*pos + 1)?;
        let p_false = self.u16_at(*pos + 3)?;
        let after = *pos + 5;
        let cond = stack
            .pop()
            .ok_or_else(|| ExprError("BRANCH without condition".into()))?;

        // `&&`: p_false == after points at `FLOAT 0.0; JUMP`, p_true at the rhs,
        // with p_true - p_false == 8 (float 5 + jump 3).
        if p_false == after
            && p_true.checked_sub(p_false) == Some(8)
            && self.code.get(p_false) == Some(&op::FLOAT)
            && self.f32_at(p_false + 1)? == 0.0
        {
            let exit = self.u16_at(p_false + 6)?; // JUMP target after the 0.0
            let (rhs, _) = self.run(p_true, Stop::At(exit))?;
            *pos = exit;
            return Ok(Frag {
                text: format!(
                    "{} && {}",
                    cond.wrapped(prec::AND),
                    rhs.wrapped(prec::AND + 1)
                ),
                prec: prec::AND,
            });
        }

        // `||`: mirror image. p_true == after points at `FLOAT 1.0; JUMP`,
        // p_false at the rhs, p_false - p_true == 8.
        if p_true == after
            && p_false.checked_sub(p_true) == Some(8)
            && self.code.get(p_true) == Some(&op::FLOAT)
            && self.f32_at(p_true + 1)? == 1.0
        {
            let exit = self.u16_at(p_true + 6)?;
            let (rhs, _) = self.run(p_false, Stop::At(exit))?;
            *pos = exit;
            return Ok(Frag {
                text: format!(
                    "{} || {}",
                    cond.wrapped(prec::OR),
                    rhs.wrapped(prec::OR + 1)
                ),
                prec: prec::OR,
            });
        }

        // `?:`: true arm runs from `after` to its JUMP, whose target is the
        // exit; the false arm runs from p_false to the exit.
        let (t_arm, jump_pos) = self.run(after, Stop::Jump)?;
        let exit = self.u16_at(jump_pos + 1)?;
        let (f_arm, _) = self.run(p_false, Stop::At(exit))?;
        *pos = exit;
        Ok(Frag {
            text: format!(
                "{} ? {} : {}",
                cond.wrapped(prec::OR),
                t_arm.wrapped(prec::TERNARY),
                f_arm.wrapped(prec::TERNARY)
            ),
            prec: prec::TERNARY,
        })
    }
}

/// Map a binary opcode to its source symbol and precedence.
fn binop(op: u8) -> Option<(&'static str, u8)> {
    Some(match op {
        op::EQUALS => ("==", prec::EQUALITY),
        op::NEQUALS => ("!=", prec::EQUALITY),
        op::GT => (">", prec::RELATIONAL),
        op::GTE => (">=", prec::RELATIONAL),
        op::LT => ("<", prec::RELATIONAL),
        op::LTE => ("<=", prec::RELATIONAL),
        op::ADD => ("+", prec::ADDITIVE),
        op::SUB => ("-", prec::ADDITIVE),
        op::MUL => ("*", prec::MULTIPLICATIVE),
        op::DIV => ("/", prec::MULTIPLICATIVE),
        op::MODULO => ("%", prec::MULTIPLICATIVE),
        _ => return None,
    })
}

/// Decompiles one dynamic-expression blob back to source.
///
/// `attrs` supplies the attribute names the expression may read (the
/// material's `m_renderAttributesUsed`); each is hashed with
/// [`attribute_token`] to recover names from the tokens stored in the
/// bytecode. The murmur2 hash is one-way, so a token with no matching name is a
/// hard error rather than a guess.
///
/// The output recompiles to byte-identical bytecode via [`compile`]; redundant
/// parentheses may appear but never change the result.
///
/// # Errors
/// Returns [`ExprError`] on malformed bytecode or an attribute token absent
/// from `attrs`.
pub fn decompile<S: AsRef<str>>(bytecode: &[u8], attrs: &[S]) -> Result<String, ExprError> {
    if bytecode.is_empty() {
        return err("empty bytecode");
    }
    let mut names = std::collections::HashMap::new();
    for a in attrs {
        let name = a.as_ref();
        // key by the (case-insensitive) token, but keep the original casing for
        // display so `$SELFILLUM` reads back as authored, matching VRF.
        names.insert(attribute_token(name), name.to_string());
    }
    let d = Decompiler {
        code: bytecode,
        names,
    };
    let (frag, end) = d.run(0, Stop::Return)?;
    if end != bytecode.len() {
        return err(format!("trailing bytecode after RETURN at {end}"));
    }
    Ok(frag.text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String {
        use std::fmt::Write as _;
        bytes.iter().fold(String::new(), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
    }

    // Hash pairs verified against VRF's StringToken via the morphic-oracle
    // `dynexpr hash` subcommand.
    #[test]
    fn murmur2_matches_valve_string_tokens() {
        assert_eq!(attribute_token("$ent_health"), 0x57b2_b714);
        assert_eq!(attribute_token("$camera_origin"), 0xbcdc_8857);
        assert_eq!(attribute_token("$ent_random"), 0xc381_b4a0);
        assert_eq!(attribute_token("$ENT_HEALTH"), 0x57b2_b714);
    }

    // Shipped blobs from Deadlock pak01, decompiled with VRF:
    //   necro_picker_hand_effect g_flOpacityScale1 = $ALPHA
    //   inferno_body g_flSelfIllumScale1 = (.5*sin(3*time()))+.5
    //   doorman_door_portal g_flAlbedoTexcoordRotation1 = $ent_age*30
    #[test]
    fn golden_attribute_only() {
        let c = compile("$ALPHA").unwrap();
        assert_eq!(hex(&c.bytecode), "191cc9271500");
        assert_eq!(c.attributes, vec!["$alpha"]);
    }

    #[test]
    fn golden_inferno_pulse() {
        let c = compile(".5*sin(3*time())+.5").unwrap();
        assert_eq!(
            hex(&c.bytecode),
            "070000003f0700004040061b001506000015070000003f1300"
        );
        assert_eq!(c.attributes, [] as [std::string::String; 0]);
    }

    #[test]
    fn golden_doorman_rotation() {
        let c = compile("$ent_age*30").unwrap();
        assert_eq!(hex(&c.bytecode), "19b92c01c4070000f0411500");
    }

    #[test]
    fn ternary_layout() {
        // $ent_health < .4 ? 1 : 0
        // cond(10B: attr 5 + float 5 + LT 1 = 11B) BRANCH(5B) true(5B) JUMP(3B) false(5B) RETURN
        let c = compile("$ent_health < .4 ? 1 : 0").unwrap();
        let b = &c.bytecode;
        assert_eq!(b[0], 0x19); // $ent_health
        assert_eq!(b[5], 0x07); // .4
        assert_eq!(b[10], 0x11); // LT
        assert_eq!(b[11], 0x04); // BRANCH
        let p_true = u16::from_le_bytes([b[12], b[13]]);
        let p_false = u16::from_le_bytes([b[14], b[15]]);
        assert_eq!(p_true, 16); // immediately after BRANCH operands
        assert_eq!(b[16], 0x07); // 1.0
        assert_eq!(b[21], 0x02); // JUMP
        let jump_to = u16::from_le_bytes([b[22], b[23]]);
        assert_eq!(p_false, 24);
        assert_eq!(b[24], 0x07); // 0.0
        assert_eq!(usize::from(jump_to), 29); // first instruction after false arm
        assert_eq!(b[29], 0x00); // RETURN
        assert_eq!(b.len(), 30);
        assert_eq!(c.attributes, vec!["$ent_health"]);
    }

    #[test]
    fn and_matches_valve_pattern() {
        // VRF detects &&: BRANCH p1 p2 with p1-p2 == 8 and `07 00000000` after
        let c = compile("$a && $b").unwrap();
        let b = &c.bytecode;
        assert_eq!(b[5], 0x04);
        let p_true = u16::from_le_bytes([b[6], b[7]]);
        let p_false = u16::from_le_bytes([b[8], b[9]]);
        assert_eq!(p_true - p_false, 8);
        assert_eq!(&b[10..15], &[0x07, 0, 0, 0, 0]);
    }

    #[test]
    fn or_matches_valve_pattern() {
        let c = compile("$a || $b").unwrap();
        let b = &c.bytecode;
        assert_eq!(b[5], 0x04);
        let p_true = u16::from_le_bytes([b[6], b[7]]);
        let p_false = u16::from_le_bytes([b[8], b[9]]);
        assert_eq!(p_false - p_true, 8);
        assert_eq!(&b[10..15], &[0x07, 0, 0, 0x80, 0x3f]);
    }

    #[test]
    fn negative_literal_uses_negate_not_fold() {
        // Valve never folds a negative literal; `-1` is `FLOAT 1.0; NEGATE`.
        // Raw blob from gold_coin_enemy.vmat_c g_flSelfIllumScale1.
        let c = compile("-1 * sin(10 * time())").unwrap();
        assert_eq!(hex(&c.bytecode), "070000803f180700002041061b00150600001500");
        // and it decompiles straight back
        assert_eq!(
            decompile(&c.bytecode, &[] as &[&str]).unwrap(),
            "-1 * sin(10 * time())"
        );
    }

    #[test]
    fn float3_call_and_swizzle() {
        let c = compile("float3(1,0,0)").unwrap();
        assert_eq!(hex(&c.bytecode), "070000803f0700000000070000000006190000");
        let s = compile("$ent_origin.xy").unwrap();
        assert_eq!(s.bytecode[5], 0x1e);
        assert_eq!(s.bytecode[6], 0b0101_0100); // x y y y packed 2b/lane
    }

    #[test]
    fn rejects_garbage() {
        assert!(compile("").is_err());
        assert!(compile("$").is_err());
        assert!(compile("foo(1)").is_err()); // unknown function
        assert!(compile("lerp(1,2)").is_err()); // arity
        assert!(compile("1 +").is_err());
        assert!(compile("v0 = 1").is_err());
    }

    // ----- decompiler -----

    fn unhex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    /// The core guarantee: decompiling a blob and recompiling it yields the
    /// identical bytes. `compile` is already byte-verified against Valve, so
    /// this gates the decompiler against the same oracle transitively.
    fn assert_round_trips(src_for_attrs: &str) {
        let compiled = compile(src_for_attrs).unwrap();
        let back = decompile(&compiled.bytecode, &compiled.attributes).unwrap();
        let recompiled = compile(&back).unwrap();
        assert_eq!(
            recompiled.bytecode, compiled.bytecode,
            "round-trip mismatch: {src_for_attrs:?} -> {back:?}"
        );
    }

    // Raw bytecode lifted from shipped Deadlock pak01 materials (the same blobs
    // the compiler goldens target), decompiled with no help from `compile`.
    #[test]
    fn decompile_shipped_hex() {
        let cases = [
            // necro_picker_hand_effect g_flOpacityScale1
            ("191cc9271500", "$alpha", vec!["$alpha"]),
            // inferno_body g_flSelfIllumScale1
            (
                "070000003f0700004040061b001506000015070000003f1300",
                "0.5 * sin(3 * time()) + 0.5",
                vec![],
            ),
            // doorman_door_portal g_flAlbedoTexcoordRotation1
            (
                "19b92c01c4070000f0411500",
                "$ent_age * 30",
                vec!["$ent_age"],
            ),
        ];
        for (h, expect, attrs) in cases {
            let bytes = unhex(h);
            assert_eq!(decompile(&bytes, &attrs).unwrap(), expect, "blob {h}");
            // and it must recompile to the original shipped bytes
            assert_eq!(compile(expect).unwrap().bytecode, bytes, "recompile {h}");
        }
    }

    #[test]
    fn decompile_golden_strings() {
        // Unambiguous shapes: assert the exact reconstructed source.
        let c = compile("$ent_age*30").unwrap();
        assert_eq!(
            decompile(&c.bytecode, &c.attributes).unwrap(),
            "$ent_age * 30"
        );

        let c = compile(".5*sin(3*time())+.5").unwrap();
        assert_eq!(
            decompile(&c.bytecode, &c.attributes).unwrap(),
            "0.5 * sin(3 * time()) + 0.5"
        );

        let c = compile("float3(1,0,0)").unwrap();
        assert_eq!(
            decompile(&c.bytecode, &c.attributes).unwrap(),
            "float3(1,0,0)"
        );

        let c = compile("$ent_origin.xy").unwrap();
        assert_eq!(
            decompile(&c.bytecode, &c.attributes).unwrap(),
            "$ent_origin.xy"
        );
    }

    #[test]
    fn decompile_attribute_lookup() {
        let c = compile("$ALPHA").unwrap();
        // names recovered lowercased (the hash is case-insensitive)
        assert_eq!(decompile(&c.bytecode, &c.attributes).unwrap(), "$alpha");
        // a token with no matching name is a hard error, not a guess
        assert!(decompile(&c.bytecode, &[] as &[&str]).is_err());
    }

    #[test]
    fn decompile_control_flow_round_trips() {
        // ternary, &&, ||, nested, mixed precedence
        for src in [
            "$ent_health < .4 ? float3(1,.1,.1) : float3(1,1,1)",
            "$a && $b",
            "$a || $b",
            "$a && $b || $c",
            "$ent_health < .5 ? $ent_age : 1 - $ent_age",
            "($a + $b) * $c",
            "$a + $b * $c",
            "!$a",
            "-$ent_age * 2",
            "clamp($ent_health, 0, 1)",
            "$ent_health > .5 && $ent_age < 2 ? sin(time()) : 0",
            "lerp(float3(1,0,0), float3(0,0,1), saturate($ent_age))",
        ] {
            assert_round_trips(src);
        }
    }
}
