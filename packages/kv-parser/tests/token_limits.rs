use kv_parser::{ParseOptions, Parser, SourceDocument};

#[test]
fn token_limit_options_apply_to_every_parse_entrypoint() {
    for length in [1024, 1925] {
        let text = format!("Root {{ Key \"{}\" }}", "a".repeat(length));
        for json in [
            "{}",
            r#"{"maxTokenLength":1024}"#,
            r#"{"maxTokenLength":null}"#,
        ] {
            let options: ParseOptions = serde_json::from_str(json).unwrap();
            let expected = length == 1024 || options.max_token_length.is_none();
            assert_eq!(Parser::parse(&text, options.clone()).is_ok(), expected);
            assert_eq!(
                Parser::parse_strict(&text, options.clone()).is_ok(),
                expected
            );
            assert_eq!(SourceDocument::parse(&text, options).is_ok(), expected);
        }
    }
    for (text, limit, expected) in [
        (r#""" """#, 0, true),
        (r#""é" "x""#, 1, false),
        (r#""a" "\n\t""#, 2, true),
        (r#""a" "\q""#, 1, false),
    ] {
        let options = ParseOptions {
            max_token_length: Some(limit),
            ..ParseOptions::default()
        };
        assert_eq!(Parser::parse_strict(text, options).is_ok(), expected);
    }
}
