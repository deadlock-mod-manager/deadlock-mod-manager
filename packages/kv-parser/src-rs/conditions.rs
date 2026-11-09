use crate::error::{KvError, Result};

/// Evaluate a KeyValues condition without assigning meanings to its symbols.
/// The resolver returns `None` for unsupported symbols. Every operand is parsed
/// so malformed syntax and unsupported symbols are reported even in an otherwise
/// decisive boolean expression. Parsing documents never evaluates conditions.
pub fn evaluate_condition(raw: &str, resolve: impl FnMut(&str) -> Option<bool>) -> Result<bool> {
    let fail = |reason: String| KvError::InvalidCondition {
        condition: raw.to_string(),
        reason,
    };
    let expression = raw
        .strip_prefix('[')
        .and_then(|text| text.strip_suffix(']'))
        .ok_or_else(|| fail("expected surrounding brackets".into()))?;
    let mut parser = Expression {
        remaining: expression,
        resolve,
    };
    let value = parser.or().map_err(fail)?;
    if !parser.remaining.trim().is_empty() {
        return Err(fail("unexpected trailing input".into()));
    }
    Ok(value)
}

struct Expression<'a, F> {
    remaining: &'a str,
    resolve: F,
}

impl<F: FnMut(&str) -> Option<bool>> Expression<'_, F> {
    fn take(&mut self, token: &str) -> bool {
        self.remaining = self.remaining.trim_start();
        if let Some(rest) = self.remaining.strip_prefix(token) {
            self.remaining = rest;
            true
        } else {
            false
        }
    }

    fn or(&mut self) -> std::result::Result<bool, String> {
        let mut value = self.and()?;
        while self.take("||") {
            value |= self.and()?;
        }
        Ok(value)
    }

    fn and(&mut self) -> std::result::Result<bool, String> {
        let mut value = self.atom()?;
        while self.take("&&") {
            value &= self.atom()?;
        }
        Ok(value)
    }

    fn atom(&mut self) -> std::result::Result<bool, String> {
        if self.take("!") {
            return Ok(!self.atom()?);
        }
        if self.take("(") {
            let value = self.or()?;
            if !self.take(")") {
                return Err("missing ')'".into());
            }
            return Ok(value);
        }
        self.take("$");
        let length = self
            .remaining
            .find(|character: char| !character.is_ascii_alphanumeric() && character != '_')
            .unwrap_or(self.remaining.len());
        if length == 0 {
            return Err("expected a symbol".into());
        }
        let name = &self.remaining[..length];
        self.remaining = &self.remaining[length..];
        (self.resolve)(name).ok_or_else(|| format!("unsupported symbol {name:?}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn symbols(name: &str) -> Option<bool> {
        match name {
            "ON" => Some(true),
            "OFF" => Some(false),
            _ => None,
        }
    }

    #[test]
    fn boolean_precedence_parentheses_and_negation() {
        for (raw, expected) in [
            ("[$ON]", true),
            ("[!$ON]", false),
            ("[!$OFF]", true),
            ("[$ON || $OFF && $OFF]", true),
            ("[($ON || $OFF) && $OFF]", false),
            ("[!($ON && $OFF) && $ON]", true),
            ("[ ON && !OFF ]", true),
        ] {
            assert_eq!(evaluate_condition(raw, symbols).unwrap(), expected, "{raw}");
        }
    }

    #[test]
    fn the_caller_owns_symbol_meanings() {
        assert!(evaluate_condition("[$CUSTOM]", |_| Some(true)).unwrap());
        assert!(!evaluate_condition("[$CUSTOM]", |_| Some(false)).unwrap());
        assert!(evaluate_condition("[$CUSTOM]", |_| None).is_err());
    }

    #[test]
    fn rejects_malformed_and_unsupported_operands_in_all_branches() {
        for raw in [
            "[$CUSTOM]",
            "[$ON || $CUSTOM]",
            "[$OFF && $CUSTOM]",
            "[$ON ||]",
            "[$OFF &&]",
            "[($ON]",
            "[$ON trailing]",
            "[]",
            "[$]",
            "[!]",
            "[$ON",
            "$ON]",
            "[$ON & $OFF]",
            "[$ON) ]",
        ] {
            assert!(evaluate_condition(raw, symbols).is_err(), "accepted {raw}");
        }
    }
}
