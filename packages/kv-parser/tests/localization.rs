use kv_parser::localization::{
    LocalizationDocument, LocalizationEdit, LocalizationError, LocalizationShape, decode,
};
use kv_parser::{ParseOptions, Parser, SourceDocument};

#[test]
fn recognizes_lang_with_and_without_tokens_and_flat_tables() {
    for (text, language, count) in [
        (
            r#""lang" { "Language" "English" "Tokens" { "a" "b" } }"#,
            Some("English"),
            1,
        ),
        (r#"LANG { Language English }"#, Some("English"), 0),
        (r#"lang { Tokens {} }"#, None, 0),
        (r#"lang { Tokens metadata }"#, None, 0),
        (r#"lang {}"#, None, 0),
    ] {
        let doc = LocalizationDocument::parse(text).unwrap();
        assert_eq!(
            doc.shape,
            LocalizationShape::Lang {
                language: language.map(str::to_string)
            }
        );
        assert_eq!(doc.entries.len(), count);
        assert_eq!(doc.edit(text, &[]), text);
    }
    let text = r#""accolades.vdata" { "score" "High score" "number" 42 }"#;
    let doc = LocalizationDocument::parse(text).unwrap();
    assert_eq!(
        doc.shape,
        LocalizationShape::Flat {
            root: "accolades.vdata".into()
        }
    );
    assert_eq!(doc.entries[1].value, "42");
}

#[test]
fn wrapper_scalar_metadata_is_preserved_but_never_a_token_edit_target() {
    let metadata = "  Language_search /* retain */ \"English\\n\" [$SEARCH]\r\n  Extra \"first\"\r\n  Extra \"last\"\r\n";
    for body in ["", "  Tokens { Token value }\r\n"] {
        let text = format!("lang\r\n{{\r\n  Language English\r\n{metadata}{body}}}\r\n");
        let doc = LocalizationDocument::parse(&text).unwrap();
        assert_eq!(doc.entries.len(), usize::from(!body.is_empty()));
        let fields = doc.metadata();
        assert_eq!(fields.len(), 3);
        assert_eq!(fields[0].key, "Language_search");
        assert_eq!(fields[0].value, "English\n");
        assert_eq!(fields[0].conditions, ["[$SEARCH]"]);
        assert_eq!(fields[0].line, 4);
        assert_eq!(fields[1].value, "first");
        assert_eq!(fields[2].value, "last");
        assert_eq!(doc.edit(&text, &[]), text);
        let mut edits = vec![LocalizationEdit::Append {
            key: "new",
            raw_value: "text",
            condition: None,
        }];
        if !body.is_empty() {
            edits.push(LocalizationEdit::Remove { entry: 0 });
        }
        let output = doc.edit(&text, &edits);
        assert!(output.contains(metadata));
        let edited = LocalizationDocument::parse(&output).unwrap();
        assert_eq!(edited.entries.len(), 1);
        assert_eq!(edited.entries[0].key, "new");
    }
}

#[test]
fn retains_raw_bytes_decoded_values_conditions_duplicates_and_lines() {
    let text = concat!(
        "\u{feff}lang /* wrapper */ {\n Tokens {\n",
        "  \"café🦀\" /* value */ \"a\\n\\t\\\\\\\"\\'\\r\\q\" [$CUSTOM && !$OTHER]\n",
        "  \"café🦀\" \"last\"\n } [$TOKENS]\n} [$ROOT] // end\n",
    );
    let doc = LocalizationDocument::parse(text).unwrap();
    assert_eq!(doc.entries.len(), 2);
    let entry = &doc.entries[0];
    assert_eq!(entry.key, "café🦀");
    assert_eq!(entry.raw_value, r#"a\n\t\\\"\'\r\q"#);
    assert_eq!(entry.value, "a\n\t\\\"\\'\\r\\q");
    assert_eq!(
        entry.conditions,
        ["[$ROOT]", "[$TOKENS]", "[$CUSTOM && !$OTHER]"]
    );
    assert_eq!(entry.line, 3);
    assert_eq!(&text[entry.value_range.clone()], entry.raw_value);
    assert_eq!(doc.entries[1].key, entry.key);
    assert_eq!(doc.entries[1].value, "last");
    assert_eq!(doc.edit(text, &[]), text);
}

#[test]
fn accepts_long_values_without_a_token_cap() {
    let value = "é".repeat(1925);
    let text = format!("lang {{ Tokens {{ Key \"{value}\" }} }}");
    let doc = LocalizationDocument::parse(&text).unwrap();
    assert_eq!(doc.entries[0].raw_value, value);
    assert_eq!(doc.edit(&text, &[]), text);
}

#[test]
fn distinguishes_syntax_directives_and_other_shapes() {
    for text in [
        "",
        "Key Value",
        "Root {} Other {}",
        "Root { Nested {} }",
        "lang { Other {} }",
        "lang { Language {} }",
        "lang { Tokens {} Tokens {} }",
        "lang { Tokens { Nested {} } }",
    ] {
        assert_eq!(
            LocalizationDocument::parse(text).unwrap_err(),
            LocalizationError::NotLocalization,
            "{text}"
        );
    }
    for directive in ["#base", "#include", "#INCLUDE"] {
        let text = format!("lang {{ Tokens {{\n {directive} \"other.txt\"\n }} }}");
        assert_eq!(
            LocalizationDocument::parse(&text).unwrap_err(),
            LocalizationError::UnsupportedDirective { line: 2 }
        );
    }
    for text in [
        "lang { Tokens {\n Key } }",
        "lang { Tokens {} }\n}",
        "lang { Tokens {} }\n/* unterminated",
        "lang { Tokens {\n Key value [$ON ||] } }",
        "lang { Tokens {} }\n#other file",
        "lang { Tokens {\n Key \"unterminated } }",
    ] {
        assert_eq!(
            LocalizationDocument::parse(text).unwrap_err(),
            LocalizationError::Syntax { line: 2 },
            "{text}"
        );
    }
    let text = "// #include \"not-a-directive\"\nRoot { /* #base x */ Key \"#include x\" }";
    assert!(LocalizationDocument::parse(text).is_ok());
}

#[test]
fn strict_termination_rejects_unclosed_quotes_without_changing_legacy_callers() {
    let text = r#"Root "value\""#;
    assert!(Parser::parse(text, ParseOptions::default()).is_ok());
    assert!(Parser::parse_strict(text, ParseOptions::default()).is_ok());
    assert!(SourceDocument::parse(text, ParseOptions::default()).is_ok());
    assert_eq!(
        LocalizationDocument::parse(text).unwrap_err(),
        LocalizationError::Syntax { line: 1 }
    );
}

#[test]
fn strict_termination_rejects_overlapping_comment_delimiters_only_for_localization() {
    let text = "Root {} /*/";
    assert!(Parser::parse(text, ParseOptions::default()).is_ok());
    assert!(SourceDocument::parse(text, ParseOptions::default()).is_ok());
    assert_eq!(
        LocalizationDocument::parse(text).unwrap_err(),
        LocalizationError::Syntax { line: 1 }
    );
    for valid in ["Root {} /**/", "Root { Key \"value\\\"\" }"] {
        assert!(LocalizationDocument::parse(valid).is_ok(), "{valid}");
    }
}

#[test]
fn decodes_supported_encodings_and_rejects_invalid_bytes() {
    let text = "lang { Tokens { \"🦀\" \"café\" } }";
    for prefix in ["", "\u{feff}"] {
        let utf8 = format!("{prefix}{text}");
        assert_eq!(decode(utf8.as_bytes()).unwrap(), utf8);
    }
    for (bom, encode) in [
        ([0xff, 0xfe], u16::to_le_bytes as fn(u16) -> [u8; 2]),
        ([0xfe, 0xff], u16::to_be_bytes),
    ] {
        let bytes: Vec<_> = bom
            .into_iter()
            .chain(text.encode_utf16().flat_map(encode))
            .collect();
        assert_eq!(decode(&bytes).unwrap(), text);
    }
    for bytes in [
        &[0xff][..],
        &[0xff, 0xfe, 0],
        &[0xfe, 0xff, 0xd8, 0],
        &[0xff, 0xfe, 0, 0xdc],
    ] {
        assert_eq!(
            decode(bytes).unwrap_err(),
            LocalizationError::Syntax { line: 1 }
        );
    }
}

#[test]
fn replacing_and_removing_specific_duplicates_preserves_every_other_byte() {
    let text = "\u{feff}lang\r\n{\r\n  Tokens\r\n  {\r\n    X /* keep */ \"old\\n\" [$A] // note\r\n    X \"last\" [$B]\r\n  }\r\n}\r\n";
    let doc = LocalizationDocument::parse(text).unwrap();
    let replaced = doc.edit(
        text,
        &[LocalizationEdit::Replace {
            entry: 1,
            raw_value: r#"new\'\n\"value"#,
        }],
    );
    assert_eq!(replaced, text.replace("\"last\"", r#""new\'\n\"value""#));
    assert_eq!(
        LocalizationDocument::parse(&replaced).unwrap().entries[1].conditions,
        ["[$B]"]
    );
    let removed = doc.edit(text, &[LocalizationEdit::Remove { entry: 0 }]);
    assert_eq!(removed, text.replace("X /* keep */ \"old\\n\" [$A]", ""));
    let parsed = LocalizationDocument::parse(&removed).unwrap();
    assert_eq!(parsed.entries.len(), 1);
    assert_eq!(parsed.entries[0].value, "last");
    let flat = "Root { key unquoted }";
    let replaced = LocalizationDocument::parse(flat).unwrap().edit(
        flat,
        &[LocalizationEdit::Replace {
            entry: 0,
            raw_value: "two words",
        }],
    );
    assert_eq!(replaced, "Root { key \"two words\" }");
}

#[test]
fn appends_use_existing_line_endings_and_indentation_for_all_shapes() {
    for nl in ["\n", "\r\n"] {
        for unit in ["\t", "  "] {
            let text = format!(
                "lang{nl}{{{nl}{unit}Language English{nl}{unit}Tokens{nl}{unit}{{{nl}{unit}{unit}\"a\" \"b\"{nl}{unit}}}{nl}}}{nl}"
            );
            let doc = LocalizationDocument::parse(&text).unwrap();
            let edited = doc.edit(
                &text,
                &[LocalizationEdit::Append {
                    key: "new\"key",
                    raw_value: r"raw\'\n",
                    condition: Some("[$CUSTOM]"),
                }],
            );
            assert_eq!(
                edited,
                text.replace(
                    &format!("{unit}}}{nl}}}"),
                    &format!(
                        "{unit}{unit}\"new\\\"key\"\t\"raw\\'\\n\" [$CUSTOM]{nl}{unit}}}{nl}}}"
                    )
                )
            );
            let parsed = LocalizationDocument::parse(&edited).unwrap();
            assert_eq!(parsed.entries[1].key, "new\"key");
            assert_eq!(parsed.entries[1].conditions, ["[$CUSTOM]"]);

            let empty = format!("lang{nl}{{{nl}{unit}Language English{nl}}}{nl}");
            let edited = LocalizationDocument::parse(&empty).unwrap().edit(
                &empty,
                &[LocalizationEdit::Append {
                    key: "a",
                    raw_value: "b",
                    condition: None,
                }],
            );
            assert_eq!(
                edited,
                format!(
                    "lang{nl}{{{nl}{unit}Language English{nl}{unit}\"Tokens\"{nl}{unit}{{{nl}{unit}{unit}\"a\"\t\"b\"{nl}{unit}}}{nl}}}{nl}"
                )
            );
            assert_eq!(
                LocalizationDocument::parse(&edited).unwrap().entries.len(),
                1
            );

            let flat = format!("root{nl}{{{nl}{unit}a b{nl}}}{nl}");
            let edited = LocalizationDocument::parse(&flat).unwrap().edit(
                &flat,
                &[LocalizationEdit::Append {
                    key: "c",
                    raw_value: "d",
                    condition: None,
                }],
            );
            assert_eq!(
                edited,
                format!("root{nl}{{{nl}{unit}a b{nl}{unit}\"c\"\t\"d\"{nl}}}{nl}")
            );
        }
    }
}

#[test]
fn mixed_edits_and_inline_empty_blocks_stay_strictly_parseable() {
    for text in ["lang {}", "lang { Tokens {} }", "root {}"] {
        let edited = LocalizationDocument::parse(text).unwrap().edit(
            text,
            &[
                LocalizationEdit::Append {
                    key: "a",
                    raw_value: "b",
                    condition: None,
                },
                LocalizationEdit::Append {
                    key: "c",
                    raw_value: "d",
                    condition: Some("[$X]"),
                },
            ],
        );
        let parsed = LocalizationDocument::parse(&edited).unwrap();
        assert_eq!(parsed.entries.len(), 2, "{edited}");
    }
    let text = "root { a b c d }";
    let doc = LocalizationDocument::parse(text).unwrap();
    let edited = doc.edit(
        text,
        &[
            LocalizationEdit::Replace {
                entry: 1,
                raw_value: "new",
            },
            LocalizationEdit::Remove { entry: 0 },
            LocalizationEdit::Append {
                key: "e",
                raw_value: "f",
                condition: None,
            },
        ],
    );
    let doc = LocalizationDocument::parse(&edited).unwrap();
    assert_eq!(
        doc.entries
            .iter()
            .map(|entry| entry.key.as_str())
            .collect::<Vec<_>>(),
        ["c", "e"]
    );
    assert_eq!(doc.entries[0].value, "new");
}
