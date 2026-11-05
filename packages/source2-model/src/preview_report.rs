//! Bounded, per-decode evidence. A usable GLB is not proof that every dependency rendered.

use std::collections::BTreeMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreviewIssueKind {
    MissingDependency,
    CorruptOverride,
    InvalidGameAsset,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewIssue {
    pub path: String,
    pub kind: PreviewIssueKind,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDependency {
    pub path: String,
    pub archive: String,
    pub overlay: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReport {
    pub issues: Vec<PreviewIssue>,
    pub dependencies: Vec<PreviewDependency>,
    pub truncated: bool,
}

#[derive(Clone, Default)]
pub(crate) struct PreviewEvidence {
    issues: BTreeMap<String, PreviewIssue>,
    dependencies: BTreeMap<String, PreviewDependency>,
    truncated: bool,
}

const MAX_EVIDENCE: usize = 512;

impl PreviewEvidence {
    pub(crate) fn issue(&mut self, issue: PreviewIssue) {
        if self.issues.len() < MAX_EVIDENCE {
            self.issues.entry(issue.path.clone()).or_insert(issue);
        } else {
            self.truncated = true;
        }
    }

    pub(crate) fn dependency(&mut self, dependency: PreviewDependency) {
        if self.dependencies.len() < MAX_EVIDENCE {
            self.dependencies
                .insert(dependency.path.clone(), dependency);
        } else {
            self.truncated = true;
        }
    }

    fn snapshot(&self) -> PreviewReport {
        PreviewReport {
            issues: self.issues.values().cloned().collect(),
            dependencies: self.dependencies.values().cloned().collect(),
            truncated: self.truncated,
        }
    }
}

pub(crate) fn snapshot(evidence: &Option<Mutex<PreviewEvidence>>) -> PreviewReport {
    evidence
        .as_ref()
        .map(|evidence| {
            evidence
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .snapshot()
        })
        .unwrap_or_default()
}
