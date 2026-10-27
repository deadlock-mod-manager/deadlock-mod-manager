use crate::ToolError;

fn replace_one(text: &mut String, before: &str, after: &str) -> Result<(), ToolError> {
    if text.matches(before).count() != 1 {
        return Err(ToolError::InvalidInput(format!(
            "Unsupported CSDK metadata: expected one occurrence of {before:?}"
        )));
    }
    *text = text.replacen(before, after, 1);
    Ok(())
}

pub(crate) fn citadel_fgd(source: &str) -> Result<String, ToolError> {
    let mut text = source.replace("\r\n", "\n");
    for (before, after) in [
        (
            "@include \"ai_defaultnpc.fgd\"",
            "@include \"ai_defaultnpc.fgd\"\n@include \"csdk_light_bases.fgd\"",
        ),
        ("@exclude env_projectedtexture\n", ""),
        ("@exclude func_orator\n", ""),
        ("SceneFile(scene)", "SceneFile(resource:vcd)"),
        (
            "// vcd_keys( string ) <-- populated based on whatever 'SceneFile' needs",
            "vcd_keys(kv3) { asset_specific_keys_source = \"SceneFile\" }",
        ),
        (
            "tint( kv3:Gradient )",
            "tint( kv3 ) { editor=\"Gradient()\" }",
        ),
        (
            "integerchoices(intchoices) : \"Integer Choices\" : 0",
            "integerchoices(intchoices) : \"Integer Choices\" : 0 =\n\t[\n\t\t0 : \"Default\"\n\t]",
        ),
        (
            "interact_style(choices) : \"Interact style\" : \"\"",
            "interact_style(choices) : \"Interact style\" : 0",
        ),
    ] {
        replace_one(&mut text, before, after)?;
    }
    Ok(text)
}

pub(crate) fn model_gamedata(source: &str) -> Result<String, ToolError> {
    let mut text = source.replace("\r\n", "\n");
    replace_one(
        &mut text,
        "animgraph_trigger_parameter_name(choices): \"\": \"\" =\n    [",
        "animgraph_trigger_parameter_name(choices): \"\": \"\" =\n    [\n        \"\"                    :\"Default (None)\"",
    )?;
    replace_one(
        &mut text,
        "leak_liquid(choices) : \"Leak liquid\" : \"\" : \"\" =\n\t[",
        "leak_liquid(choices) : \"Leak liquid\" : \"\" : \"\" =\n\t[\n\t\t\"\"                  : \"None\"",
    )?;
    Ok(text)
}

pub(crate) fn add_choreo_type(source: &str) -> Result<String, ToolError> {
    let mut text = source.replace("\r\n", "\n");
    replace_one(
        &mut text,
        "\tassettypes =\n\t{",
        "\tassettypes =\n\t{\n\
        dmm_choreo_scene =\n\
        {\n\
            _class = \"CResourceAssetTypeInfo\"\n\
            m_FriendlyName = \"Choreo Scene\"\n\
            m_Ext = \"vcd\"\n\
            m_CompilerIdentifier = \"CompileChoreoScene\"\n\
            m_bContentFileIsText = true\n\
            m_Blocks = [ { m_BlockID = \"DATA\" m_Encoding = \"RESOURCE_ENCODING_KV3\" } ]\n\
        }\n",
    )?;
    Ok(text)
}

fn block(text: &str, key: &str) -> Result<std::ops::Range<usize>, ToolError> {
    let needle = text
        .find(key)
        .ok_or_else(|| ToolError::InvalidInput(format!("Missing {key} section")))?;
    let start = needle
        + text[needle..]
            .find('{')
            .ok_or_else(|| ToolError::InvalidInput(format!("Missing {key} body")))?;
    let bytes = text.as_bytes();
    let (mut index, mut depth, mut quoted) = (start, 0, false);
    while index < bytes.len() {
        match bytes[index] {
            b'\\' if quoted => index += 1,
            b'"' => quoted = !quoted,
            b'/' if !quoted && bytes.get(index + 1) == Some(&b'/') => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            b'{' if !quoted => depth += 1,
            b'}' if !quoted => {
                depth -= 1;
                if depth == 0 {
                    return Ok(start..index + 1);
                }
            }
            _ => {}
        }
        index += 1;
    }
    Err(ToolError::InvalidInput(format!("Unclosed {key} section")))
}

pub(crate) fn add_ag2_model_dependency(source: &str) -> Result<String, ToolError> {
    let mut text = source.replace("\r\n", "\n");
    let model = block(&text, "\n\t\tmodel_asset =")?;
    let mut body = text[model.clone()].to_owned();
    let key = "m_CompileDependsOnResourceTypes";
    let start = body
        .find(key)
        .ok_or_else(|| ToolError::InvalidInput("Missing model compiler dependency types".into()))?;
    let open = start
        + body[start..].find('[').ok_or_else(|| {
            ToolError::InvalidInput("Missing model compiler dependency list".into())
        })?;
    let end = open
        + body[open..].find(']').ok_or_else(|| {
            ToolError::InvalidInput("Unclosed model compiler dependency list".into())
        })?;
    if !body[open..end].contains("\"vnmskel\"") {
        body.insert_str(open + 1, "\n\t\t\t\t\"vnmskel\",");
    }
    text.replace_range(model, &body);
    Ok(text)
}

pub(crate) fn gameinfo(source: &str) -> Result<String, ToolError> {
    let mut text = source.replace("\r\n", "\n");
    let paths = block(&text, "SearchPaths")?;
    text.replace_range(paths, "{\n Mod citadel\n Write citadel\n Game citadel\n Mod core\n Write core\n Game core\n AddonRoot citadel_addons\n }");
    let modeldoc = block(&text, "\n\tModelDoc")?;
    let mut body = text[modeldoc.clone()].to_owned();
    let start = body
        .find("\"features\"")
        .ok_or_else(|| ToolError::InvalidInput("Missing ModelDoc features".into()))?;
    let value = start + "\"features\"".len();
    let open = value
        + body[value..]
            .find('"')
            .ok_or_else(|| ToolError::InvalidInput("Missing feature value".into()))?;
    let end = open
        + 1
        + body[open + 1..]
            .find('"')
            .ok_or_else(|| ToolError::InvalidInput("Unclosed feature value".into()))?;
    body.replace_range(open..=end, "\"animgraph;animgraph_compatibility_force;gamepreview;modelconfig;editorconfig;wireframe_backfaces;distancefield\"");
    text.replace_range(modeldoc, &body);
    Ok(text)
}

pub fn editor_addon_root(source: &str, root: Option<&str>) -> Result<String, ToolError> {
    if root.is_some_and(|name| {
        !name.starts_with("dmm_external_")
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    }) {
        return Err(ToolError::InvalidInput("Invalid editor addon root".into()));
    }
    let mut text = source.to_owned();
    let paths = block(&text, "SearchPaths")?;
    let body = &text[paths.start + 1..paths.end - 1];
    let mut replacement = String::from("{\n");
    if let Some(root) = root {
        replacement.push_str(&format!(" AddonRoot {root}\n"));
    }
    for line in body.lines() {
        let mut tokens = line.split_whitespace();
        let managed = tokens
            .next()
            .is_some_and(|key| key.eq_ignore_ascii_case("AddonRoot"))
            && tokens
                .next()
                .is_some_and(|value| value.starts_with("dmm_external_"));
        if !managed && !line.trim().is_empty() {
            replacement.push_str(line);
            replacement.push('\n');
        }
    }
    replacement.push('}');
    text.replace_range(paths, &replacement);
    Ok(text)
}

pub fn modeldoc_preview_entity(source: &str) -> Result<String, ToolError> {
    let mut text = source.to_owned();
    let root = block(&text, "rootNode")?;
    let mut body = text[root.clone()].to_owned();
    if !body.contains("primary_associated_entity") {
        body.insert_str(1, "\n primary_associated_entity = \"prop_dynamic\"\n");
    } else {
        body = body.replace(
            "primary_associated_entity = \"\"",
            "primary_associated_entity = \"prop_dynamic\"",
        );
    }
    text.replace_range(root, &body);
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_models_get_a_preview_entity_without_overriding_an_existing_one() {
        let source = "{ rootNode = { _class = \"RootNode\" children = [] } }";
        let output = modeldoc_preview_entity(source).unwrap();
        assert!(output.contains("primary_associated_entity = \"prop_dynamic\""));
        assert_eq!(modeldoc_preview_entity(&output).unwrap(), output);
        let existing = source.replace(
            "children",
            "primary_associated_entity = \"prop_physics\" children",
        );
        assert_eq!(modeldoc_preview_entity(&existing).unwrap(), existing);
    }

    #[test]
    fn models_can_register_ag2_skeleton_dependencies_without_changing_other_types() {
        let source = "assettypes {\n\t\tmodel_asset = { m_Ext = \"vmdl\" m_CompileDependsOnResourceTypes = [ \"vmat\", \"vmesh\" ] m_Blocks = [] }\n other_asset = { m_CompileDependsOnResourceTypes = [ \"vmdl\" ] } }";
        let output = add_ag2_model_dependency(source).unwrap();
        let model = block(&output, "\n\t\tmodel_asset =").unwrap();
        assert!(output[model].contains("\"vnmskel\""));
        assert!(
            output.contains("other_asset = { m_CompileDependsOnResourceTypes = [ \"vmdl\" ] }")
        );
        assert_eq!(output.matches("\"vnmskel\"").count(), 1);
        assert_eq!(add_ag2_model_dependency(&output).unwrap(), output);
    }

    #[test]
    fn editor_addon_roots_change_without_discarding_base_paths_or_other_settings() {
        let source = "FileSystem { SearchPaths {\n Mod citadel\n Game core\n AddonRoot citadel_addons\n } }\n ModelDoc { features old }";
        let first = editor_addon_root(source, Some("dmm_external_one")).unwrap();
        assert!(first.contains("AddonRoot dmm_external_one"));
        assert_eq!(
            editor_addon_root(&first, Some("dmm_external_one")).unwrap(),
            first
        );
        let second = editor_addon_root(&first, Some("dmm_external_two")).unwrap();
        assert!(!second.contains("dmm_external_one"));
        assert!(second.contains("AddonRoot dmm_external_two"));
        assert!(second.contains("Mod citadel"));
        assert!(second.contains("Game core"));
        assert!(second.contains("AddonRoot citadel_addons"));
        assert!(second.contains("ModelDoc { features old }"));
        assert!(
            !editor_addon_root(&second, None)
                .unwrap()
                .contains("dmm_external_")
        );
        assert!(editor_addon_root(source, Some("../bad")).is_err());
    }

    #[test]
    fn search_paths_do_not_keep_installed_user_addons() {
        let source = "FileSystem { SearchPaths { Game \"citadel/addons\" // } ignored\n Game core } }\n\tModelDoc { \"features\" \"old\" }";
        let output = gameinfo(source).unwrap();
        assert!(!output.contains("citadel/addons"));
        assert!(output.contains("Game citadel"));
        assert!(output.contains("animgraph_compatibility_force"));
    }

    #[test]
    fn block_scanner_ignores_braces_in_strings_and_comments() {
        let source = "Part { key \"{\\\"}\" // }\n child {} } tail";
        assert_eq!(
            &source[block(source, "Part").unwrap()],
            "{ key \"{\\\"}\" // }\n child {} }"
        );
    }
}
