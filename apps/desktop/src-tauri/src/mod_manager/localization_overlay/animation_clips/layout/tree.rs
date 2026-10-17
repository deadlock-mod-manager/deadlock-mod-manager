use std::collections::BTreeMap;

/// NM import preserves hierarchy traversal within each sampling LOD. Recover
/// its two ordered partitions using named pose anchors and the authored tree.
pub(super) struct LayoutTree {
  children: Vec<Vec<usize>>,
  anchors: Vec<Option<usize>>,
  low_count: usize,
  members: Vec<Vec<usize>>,
  counts: Vec<(usize, usize)>,
  cache: BTreeMap<(usize, usize, usize), Option<Vec<usize>>>,
  budget: usize,
}

impl LayoutTree {
  pub(super) fn new(
    children: Vec<Vec<usize>>,
    anchors: Vec<Option<usize>>,
    low_count: usize,
  ) -> Self {
    let mut members = vec![Vec::new(); children.len()];
    for node in (0..children.len()).rev() {
      members[node].push(node);
      for child in &children[node] {
        let descendants = members[*child].clone();
        members[node].extend(descendants);
      }
    }
    let counts = members
      .iter()
      .map(|bones| {
        let low = bones.iter().filter(|bone| **bone < low_count).count();
        (low, bones.len() - low)
      })
      .collect();
    Self {
      children,
      anchors,
      low_count,
      members,
      counts,
      cache: BTreeMap::new(),
      budget: 20_000,
    }
  }

  pub(super) fn solve(&mut self, node: usize, low: usize, high: usize) -> Option<Vec<usize>> {
    if self.budget == 0 {
      return None;
    }
    self.budget -= 1;
    if let Some(result) = self.cache.get(&(node, low, high)) {
      return result.clone();
    }
    let result = self.solve_node(node, low, high);
    self.cache.insert((node, low, high), result.clone());
    result
  }

  fn solve_node(&mut self, node: usize, low: usize, high: usize) -> Option<Vec<usize>> {
    let (low_size, high_size) = self.counts[node];
    for bone in &self.members[node] {
      if let Some(anchor) = self.anchors[*bone] {
        let (start, size) = if *bone < self.low_count {
          (low, low_size)
        } else {
          (high, high_size)
        };
        if anchor < start || anchor >= start + size {
          return None;
        }
      }
    }
    let is_low = node < self.low_count;
    if self.anchors[node].is_some_and(|anchor| anchor != if is_low { low } else { high }) {
      return None;
    }
    let mut result = vec![node];
    let children = self.children[node].clone();
    result.extend(self.place(
      &children,
      low + usize::from(is_low),
      high + usize::from(!is_low),
    )?);
    result.sort_by_key(|bone| usize::from(*bone >= self.low_count));
    Some(result)
  }

  fn place(&mut self, remaining: &[usize], low: usize, high: usize) -> Option<Vec<usize>> {
    if remaining.is_empty() {
      return Some(Vec::new());
    }
    for (position, child) in remaining.iter().enumerate() {
      let Some(mut order) = self.solve(*child, low, high) else {
        continue;
      };
      let rest: Vec<_> = remaining
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != position)
        .map(|(_, child)| *child)
        .collect();
      let (low_size, high_size) = self.counts[*child];
      if let Some(tail) = self.place(&rest, low + low_size, high + high_size) {
        order.extend(tail);
        return Some(order);
      }
    }
    None
  }
}
