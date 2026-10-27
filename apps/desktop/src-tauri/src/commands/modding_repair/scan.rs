use std::{
  collections::{BTreeMap, BTreeSet},
  io::Read,
  path::Path,
};

use sha2::{Digest, Sha256};

use super::super::{
  modding_batch,
  modding_edits::fingerprint,
  modding_source,
  modding_workspace::{contained, relative},
};
use super::{
  ModdingRepairIssue, ModdingRepairKind as Kind, ModdingRepairScan,
  material::{self, Replacement},
  stock::Stock,
};
use crate::errors::Error;

pub(super) type Snapshot = BTreeMap<String, String>;

pub(super) struct Proposal {
  pub id: String,
  pub file: String,
  pub replacements: Vec<Replacement>,
  pub recovered: BTreeMap<String, Vec<u8>>,
  pub stock_fingerprint: Option<String>,
}

pub(super) struct Scan {
  pub report: ModdingRepairScan,
  pub snapshot: Snapshot,
  proposals: Vec<Proposal>,
  sources: BTreeMap<String, String>,
}

impl Scan {
  pub fn changes(&self, selected: &BTreeSet<String>) -> Result<BTreeMap<String, Vec<u8>>, Error> {
    let mut replacements: BTreeMap<String, Vec<&Replacement>> = BTreeMap::new();
    let mut changes = BTreeMap::new();
    for id in selected {
      let proposal = self
        .proposals
        .iter()
        .find(|proposal| proposal.id == *id)
        .ok_or_else(|| {
          Error::InvalidInput("Repair selection is stale or unsupported; re-scan first".into())
        })?;
      replacements
        .entry(proposal.file.clone())
        .or_default()
        .extend(&proposal.replacements);
      for (path, bytes) in &proposal.recovered {
        if changes.get(path).is_some_and(|previous| previous != bytes) {
          return Err(Error::InvalidInput(format!(
            "Stock exports disagree about {path}; select one recovery at a time"
          )));
        }
        changes.insert(path.clone(), bytes.clone());
      }
    }
    for (file, mut edits) in replacements {
      if edits.is_empty() {
        continue;
      }
      let original = self
        .sources
        .get(&file)
        .ok_or_else(|| Error::InvalidInput("Repair source missing from scan".into()))?;
      let mut text = original.clone();
      edits.sort_by_key(|edit| std::cmp::Reverse(edit.start));
      let mut end = text.len();
      for edit in edits {
        if edit.end > end {
          return Err(Error::InvalidInput(
            "Selected repairs overlap; re-scan first".into(),
          ));
        }
        text.replace_range(edit.start..edit.end, &edit.text);
        end = edit.start;
      }
      modding_source::fields(&text)?;
      changes.insert(file, text.into_bytes());
    }
    Ok(changes)
  }
}

pub(super) fn snapshot(root: &Path) -> Result<Snapshot, Error> {
  let mut result = BTreeMap::new();
  let mut size = 0u64;
  for path in modding_batch::files(root)? {
    let mut input = std::fs::File::open(contained(root, &path)?)?;
    size = size
      .checked_add(input.metadata()?.len())
      .ok_or_else(|| Error::InvalidInput("Addon scan size overflow".into()))?;
    if size > 8 * 1024 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "Scan supports addons up to 8 GB; select a smaller addon".into(),
      ));
    }
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
      let count = input.read(&mut buffer)?;
      if count == 0 {
        break;
      }
      hasher.update(&buffer[..count]);
    }
    result.insert(path, format!("{:x}", hasher.finalize()));
  }
  Ok(result)
}

pub(super) fn asset_reference(value: &str) -> bool {
  let lower = value.to_ascii_lowercase();
  [
    "vmat", "vtex", "vpcf", "vmdl", "vnmskel", "vnmclip", "vnmgraph", "vdata", "vsnd", "vsndevts",
    "dmx", "fbx", "png", "tga", "psd", "jpg", "jpeg", "tif", "tiff", "exr", "wav", "mp3",
  ]
  .iter()
  .any(|extension| lower.ends_with(&format!(".{extension}")))
}

fn normalized(value: &str) -> String {
  value.replace('\\', "/").to_ascii_lowercase()
}

struct Scanner<'a> {
  root: &'a Path,
  stock: &'a Stock,
  index: BTreeMap<String, Vec<String>>,
  basenames: BTreeMap<String, Vec<String>>,
  scan: Scan,
  recoveries: BTreeMap<String, bool>,
  issues: BTreeSet<String>,
}

impl Scanner<'_> {
  fn issue(
    &mut self,
    kind: Kind,
    location: (&str, &str, &str),
    proposed: Option<String>,
    targets: Vec<String>,
    detail: String,
    repairable: bool,
  ) -> String {
    let (file, property, current) = location;
    let id = fingerprint(
      format!("{kind:?}\0{file}\0{property}\0{current}\0{proposed:?}\0{targets:?}").as_bytes(),
    );
    if self.issues.insert(id.clone()) {
      self.scan.report.issues.push(ModdingRepairIssue {
        id: id.clone(),
        kind,
        file: file.into(),
        property: property.into(),
        current: current.into(),
        proposed,
        targets,
        detail,
        repairable,
      });
    }
    id
  }

  fn recover(&mut self, file: &str, property: &str, reference: &str) -> bool {
    if relative(reference, false).is_err() {
      return false;
    }
    let Some(entry) = self.stock.entry(reference).map(str::to_owned) else {
      return false;
    };
    if let Some(recoverable) = self.recoveries.get(&entry) {
      return *recoverable;
    }
    self.recoveries.insert(entry.clone(), false);
    match self.stock.export(&entry) {
      Ok(export) => {
        if !export
          .files
          .keys()
          .any(|path| normalized(path) == normalized(reference))
        {
          self.scan.report.diagnostics.push(format!(
            "{entry}: Source 2 Viewer did not export the requested source {reference}."
          ));
          return false;
        }
        let recovered: BTreeMap<_, _> = export
          .files
          .into_iter()
          .filter(|(path, _)| !self.index.contains_key(&normalized(path)))
          .collect();
        let targets = recovered.keys().cloned().collect::<Vec<_>>();
        let id = self.issue(Kind::StockDependency, (file, property, reference), Some(entry), targets, "Exact installed-game asset exported with Source 2 Viewer. Only missing files are added; existing custom files are preserved.".into(), true);
        self.scan.proposals.push(Proposal {
          id,
          file: file.into(),
          replacements: Vec::new(),
          recovered,
          stock_fingerprint: Some(export.fingerprint),
        });
        self
          .recoveries
          .insert(self.stock.entry(reference).unwrap().to_owned(), true);
        true
      }
      Err(error) => {
        self.scan.report.diagnostics.push(format!(
          "Stock dependency {reference} could not be exported: {error}"
        ));
        false
      }
    }
  }

  fn reference(&mut self, file: &str, field: &modding_source::Field, text: &str) {
    let reference = material::literal(text, field);
    if !asset_reference(reference)
      || field.name.eq_ignore_ascii_case("from")
      || field.path.contains("Compiled Textures/")
    {
      return;
    }
    let key = normalized(reference);
    let direct = self.index.get(&key);
    let candidates = direct
      .or_else(|| self.basenames.get(key.rsplit('/').next().unwrap_or(&key)))
      .cloned()
      .unwrap_or_default();
    if candidates.len() == 1 {
      let target = &candidates[0];
      if target == reference {
        return;
      }
      let raw = &text[field.start..field.end];
      let prefix = if raw.trim_start().starts_with("resource:") {
        "resource:"
      } else {
        ""
      };
      let id = self.issue(
        Kind::PathRepair,
        (file, &field.path, reference),
        Some(target.clone()),
        vec![target.clone()],
        "Unique addon file match; normalize the reference to its addon-relative path and spelling."
          .into(),
        true,
      );
      self.scan.proposals.push(Proposal {
        id,
        file: file.into(),
        replacements: vec![Replacement {
          start: field.start,
          end: field.end,
          text: format!(
            "{prefix}{}",
            serde_json::to_string(target).expect("path serializes")
          ),
        }],
        recovered: BTreeMap::new(),
        stock_fingerprint: None,
      });
    } else if candidates.len() > 1 {
      self.issue(
        Kind::AmbiguousPath,
        (file, &field.path, reference),
        None,
        candidates,
        "Several addon files match this path. Choose the intended asset manually.".into(),
        false,
      );
    } else if !self.recover(file, &field.path, &key) {
      self.issue(Kind::MissingDependency, (file, &field.path, reference), None, Vec::new(), "No unique addon file or recoverable exact installed-game source. Supply the missing custom asset; no stock substitution was made.".into(), false);
    }
  }

  fn source(&mut self, path: &str, text: String) {
    let fields = match modding_source::fields(&text) {
      Ok(fields) => fields,
      Err(error) => {
        self.issue(
          Kind::UnreadableSource,
          (path, "", ""),
          None,
          Vec::new(),
          error.to_string(),
          false,
        );
        return;
      }
    };
    if path.to_ascii_lowercase().ends_with(".vmat") {
      match material::inspect(&text, &fields) {
        Ok(material) => {
          if material.empty {
            self.issue(Kind::EmptyTemplate, (path, "", &material.shader), None, Vec::new(), "No texture artwork is assigned. Shader conversion cannot restore missing artwork or establish visual fidelity.".into(), false);
          }
          if !material.replacements.is_empty() {
            let id = self.issue(Kind::ShaderConversion, (path, "Layer0/shader", &material.shader), Some("pbr.vfx; g_vColorTint → g_vColorTint1".into()), vec![path.into()], "Compilation-only mapping for the verified untextured CS2 environment template; all other source properties are preserved.".into(), true);
            self.scan.proposals.push(Proposal {
              id,
              file: path.into(),
              replacements: material.replacements,
              recovered: BTreeMap::new(),
              stock_fingerprint: None,
            });
          } else if material.shader.eq_ignore_ascii_case("csgo_environment.vfx") {
            self.issue(Kind::UnsupportedFeature, (path, "Layer0", &material.shader), None, material.unsupported, "Textured, non-default, duplicate, or dynamic CS2 shader parameters have no verified mapping. The material is left unchanged.".into(), false);
          } else if !material.shader.eq_ignore_ascii_case("pbr.vfx") {
            self.issue(Kind::UnsupportedShader, (path, "Layer0/shader", &material.shader), None, Vec::new(), "This shader has no verified migration rule. It may already be supported by Deadlock; no conversion was proposed.".into(), false);
          }
        }
        Err(error) => {
          self.issue(
            Kind::UnreadableSource,
            (path, "", ""),
            None,
            Vec::new(),
            error.to_string(),
            false,
          );
        }
      }
    }
    for field in &fields {
      self.reference(path, field, &text);
    }
    self.scan.sources.insert(path.into(), text);
  }

  fn fbx(&mut self, path: &str, bytes: &[u8]) {
    match super::fbx::textures(bytes) {
      Ok(references) => {
        for reference in references {
          let key = normalized(&reference);
          if self
            .index
            .get(&key)
            .is_some_and(|matches| matches.len() == 1)
          {
            continue;
          }
          let candidates = self
            .basenames
            .get(key.rsplit('/').next().unwrap_or(&key))
            .cloned()
            .unwrap_or_default();
          self.issue(Kind::ExternalFbxTexture, (path, "FBX texture", &reference), None, candidates, "External FBX texture reference. FBX files are preserved; relink in Blender or provide the original texture. Embedded colors are not automatically recovered or validated.".into(), false);
        }
      }
      Err(error) => {
        self.issue(
          Kind::UninspectedSource,
          (path, "FBX", ""),
          None,
          Vec::new(),
          error.to_string(),
          false,
        );
      }
    }
  }
}

pub(super) fn scan(root: &Path, stock: &Stock) -> Result<Scan, Error> {
  let initial = snapshot(root)?;
  let mut scanner = Scanner {
    root,
    stock,
    index: BTreeMap::new(),
    basenames: BTreeMap::new(),
    recoveries: BTreeMap::new(),
    issues: BTreeSet::new(),
    scan: Scan {
      report: ModdingRepairScan {
        fingerprint: String::new(),
        scanned_files: initial.len(),
        issues: Vec::new(),
        diagnostics: stock.diagnostic.iter().cloned().collect(),
      },
      snapshot: initial,
      proposals: Vec::new(),
      sources: BTreeMap::new(),
    },
  };
  let files = scanner.scan.snapshot.keys().cloned().collect::<Vec<_>>();
  for path in &files {
    scanner
      .index
      .entry(normalized(path))
      .or_default()
      .push(path.clone());
    scanner
      .basenames
      .entry(normalized(path.rsplit('/').next().unwrap_or(path)))
      .or_default()
      .push(path.clone());
  }
  let mut skipped: BTreeMap<String, usize> = BTreeMap::new();
  for path in files {
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let text_source = [
      "vmat", "vtex", "vmdl", "vnmskel", "vnmclip", "vnmgraph", "vpcf", "vdata", "vsndevts",
    ]
    .contains(&extension.as_str());
    if !text_source && extension != "fbx" {
      if ["dmx", "vmap", "vpost"].contains(&extension.as_str()) {
        *skipped.entry(extension).or_default() += 1;
      }
      continue;
    }
    let file = contained(scanner.root, &path)?;
    let limit = if extension == "fbx" {
      128 * 1024 * 1024
    } else {
      16 * 1024 * 1024
    };
    if file.metadata()?.len() > limit {
      scanner.issue(
        Kind::UninspectedSource,
        (&path, "", ""),
        None,
        Vec::new(),
        "Source exceeds the safe inspection size limit; left unchanged.".into(),
        false,
      );
      continue;
    }
    let bytes = std::fs::read(file)?;
    if fingerprint(&bytes) != scanner.scan.snapshot[&path] {
      return Err(Error::InvalidInput(
        "Addon changed during scanning; re-scan when edits finish".into(),
      ));
    }
    if extension == "fbx" {
      scanner.fbx(&path, &bytes);
    } else {
      match String::from_utf8(bytes) {
        Ok(text) => scanner.source(&path, text),
        Err(_) => {
          scanner.issue(
            Kind::UnreadableSource,
            (&path, "", ""),
            None,
            Vec::new(),
            "Source is not UTF-8; binary source migration is unsupported.".into(),
            false,
          );
        }
      }
    }
  }
  for (extension, count) in skipped {
    scanner.issue(Kind::UninspectedSource, ("", &extension, &count.to_string()), None, Vec::new(), "These source files are preserved. This scanner has no migration or dependency inspection rule for this format.".into(), false);
  }
  if snapshot(root)? != scanner.scan.snapshot {
    return Err(Error::InvalidInput(
      "Addon changed during scanning; re-scan when edits finish".into(),
    ));
  }
  let mut hasher = Sha256::new();
  hasher.update(
    serde_json::to_vec(&scanner.scan.snapshot)
      .map_err(|error| Error::InvalidInput(error.to_string()))?,
  );
  for proposal in &scanner.scan.proposals {
    hasher.update(proposal.id.as_bytes());
    // S2V can regenerate DMX object IDs. Track the original compiled entry,
    // while the proposal ID tracks its complete list of missing outputs.
    if let Some(stock) = &proposal.stock_fingerprint {
      hasher.update(stock.as_bytes());
    }
  }
  scanner.scan.report.fingerprint = format!("{:x}", hasher.finalize());
  Ok(scanner.scan)
}
