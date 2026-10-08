use crate::types::DmpComment;

/// Parses the comment stream Source 2 games write into their dumps.
///
/// ```text
/// error
///
/// AbortMessage({FATAL ERROR: Failed to read 16 bytes
/// })
/// Uptime( 8.929353 )
/// Addons:
/// Command Line: "deadlock.exe" -steam -console
/// Build: 10725 (revision 10577413)
/// ```
pub fn parse_comment(text: &str) -> DmpComment {
    let mut comment = DmpComment {
        kind: text
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(str::to_string),
        abort_message: abort_message(text),
        ..DmpComment::default()
    };

    // The header comes first; the console history after it can echo anything.
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if let Some(value) = line.strip_prefix("Uptime(") {
            if comment.uptime_secs.is_none() {
                comment.uptime_secs = value.trim_end_matches(')').trim().parse().ok();
            }
        } else if let Some(value) = line.strip_prefix("Addons:") {
            comment.addons.get_or_insert_with(|| {
                value
                    .split([',', ' ', '\t'])
                    .map(str::trim)
                    .filter(|addon| !addon.is_empty())
                    .map(str::to_string)
                    .collect()
            });
        } else if let Some(value) = line.strip_prefix("Command Line:") {
            comment
                .command_line
                .get_or_insert_with(|| value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Build:") {
            comment
                .build
                .get_or_insert_with(|| value.trim().to_string());
        }
    }

    comment
}

fn abort_message(text: &str) -> Option<String> {
    let start = text.find("AbortMessage({")? + "AbortMessage({".len();
    let end = text[start..].find("})")? + start;
    let message = text[start..end].trim();
    (!message.is_empty()).then(|| message.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ERROR_COMMENT: &str = "error\n\nAbortMessage({FATAL ERROR: Failed to read 16 bytes\n})\nUptime( 8.929353 )\nTotal frames( 18446744073709551615 )\nCurrent Map: '(unknown)'\nAddons: \n\nSpawnCount: 0\nCommand Line: \"deadlock.exe\" -steam -console -exec autoexec\nBuild: 10725 (revision 10577413)\n";

    #[test]
    fn reads_an_error_dump_comment() {
        let comment = parse_comment(ERROR_COMMENT);

        assert_eq!(comment.kind.as_deref(), Some("error"));
        assert_eq!(
            comment.abort_message.as_deref(),
            Some("FATAL ERROR: Failed to read 16 bytes")
        );
        assert_eq!(comment.uptime_secs, Some(8.929353));
        assert_eq!(comment.addons, Some(Vec::new()));
        assert_eq!(
            comment.command_line.as_deref(),
            Some("\"deadlock.exe\" -steam -console -exec autoexec")
        );
        assert_eq!(comment.build.as_deref(), Some("10725 (revision 10577413)"));
    }

    #[test]
    fn reads_a_crash_comment_with_addons_and_crlf() {
        let comment = parse_comment(
            "Crash\r\nUptime( 112.592268 )\r\nAddons: workshop_a, workshop_b\r\nVPK overrides: \r\n",
        );

        assert_eq!(comment.kind.as_deref(), Some("Crash"));
        assert_eq!(comment.abort_message, None);
        assert_eq!(comment.uptime_secs, Some(112.592268));
        assert_eq!(
            comment.addons,
            Some(vec!["workshop_a".to_string(), "workshop_b".to_string()])
        );
    }

    #[test]
    fn missing_lines_stay_unknown() {
        let comment = parse_comment("Crash\nSomething else\n");

        assert_eq!(comment.uptime_secs, None);
        assert_eq!(comment.addons, None);
        assert_eq!(comment.build, None);
    }

    #[test]
    fn console_history_lines_do_not_override_the_header() {
        let comment = parse_comment(
            "Crash\nUptime( 40.5 )\nAddons: \nConsole History (reversed)\n\nUptime( 999 )\nAddons: echoed\n",
        );

        assert_eq!(comment.uptime_secs, Some(40.5));
        assert_eq!(comment.addons, Some(Vec::new()));
    }
}
