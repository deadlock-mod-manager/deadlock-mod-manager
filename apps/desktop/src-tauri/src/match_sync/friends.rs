//! Which Steam friends probably played a match deadlock-api hasn't stored yet. Pure and
//! clock-injected so it unit-tests without Steam or the API; [`super::sync`] feeds it
//! from the GC and deadlock-api clients.

const HOUR: i64 = 60 * 60;
const DAY: i64 = 24 * HOUR;

// Bounds for a friend's typical gap between matches, and the fallback when the stored
// history is too short to tell.
const MIN_GAP: i64 = HOUR;
const MAX_GAP: i64 = 3 * DAY;
const DEFAULT_GAP: i64 = DAY;
/// How many of a friend's newest stored matches the cadence is read from.
pub const GAP_SAMPLE: usize = 20;
// A match takes a while to start and finish; being online only briefly after the last
// stored match doesn't mean another one was played.
const MIN_ACTIVITY_AFTER_LAST: i64 = 45 * 60;
// Unless they're in Deadlock right now, a friend whose newest stored match is this old has
// most likely stopped playing, and isn't worth a lookup.
const MAX_IDLE: i64 = 14 * DAY;
// Being in Deadlock right now always ranks ahead of a cadence guess.
const IN_GAME_BOOST: u64 = 1 << 32;

/// What Steam's persona state says about a friend right now.
#[derive(Clone, Copy, Debug, Default)]
pub struct Persona {
  pub in_deadlock: bool,
  pub online: bool,
  /// Last time the friend was seen online, if Steam shares it.
  pub last_seen: Option<i64>,
}

/// Median gap between consecutive matches in `starts_newest_first`, clamped.
fn typical_gap(starts_newest_first: &[i64]) -> i64 {
  let sample = &starts_newest_first[..starts_newest_first.len().min(GAP_SAMPLE)];
  let mut gaps: Vec<i64> = sample.windows(2).map(|w| (w[0] - w[1]).abs()).collect();
  if gaps.len() < 2 {
    return DEFAULT_GAP;
  }
  gaps.sort_unstable();
  gaps[gaps.len() / 2].clamp(MIN_GAP, MAX_GAP)
}

/// `Some(score)` if the friend likely played after `last_end` (the end of their newest
/// stored match); higher scores are more likely and should be looked up first.
pub fn estimate(
  now: i64,
  last_end: i64,
  starts_newest_first: &[i64],
  persona: Option<Persona>,
) -> Option<u64> {
  let elapsed = now - last_end;
  if elapsed <= 0 {
    return None;
  }
  let gap = typical_gap(starts_newest_first);
  let score = u64::try_from(elapsed * 100 / gap).unwrap_or(0);

  if persona.is_some_and(|p| p.in_deadlock) {
    return (elapsed > HOUR).then_some(score + IN_GAME_BOOST);
  }
  if elapsed >= MAX_IDLE {
    return None;
  }
  match persona.and_then(|p| p.online.then_some(now).or(p.last_seen)) {
    Some(seen) => (seen > last_end + MIN_ACTIVITY_AFTER_LAST && elapsed > gap).then_some(score),
    None => (elapsed > 2 * gap).then_some(score),
  }
}

/// The `budget` highest-scoring friends, best first.
pub fn pick<T>(mut scored: Vec<(T, u64)>, budget: usize) -> Vec<T> {
  scored.sort_by_key(|&(_, score)| std::cmp::Reverse(score));
  scored
    .into_iter()
    .take(budget)
    .map(|(friend, _)| friend)
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  const NOW: i64 = 1_000_000_000;

  // A friend playing about every 2h, newest match ending `ago` seconds before NOW.
  fn regular(ago: i64) -> (i64, Vec<i64>) {
    let last_start = NOW - ago - 1800;
    let starts = (0..10).map(|i| last_start - i * 2 * HOUR).collect();
    (NOW - ago, starts)
  }

  #[test]
  fn gap_is_median_and_clamped() {
    assert_eq!(typical_gap(&[]), DEFAULT_GAP);
    assert_eq!(typical_gap(&[10, 5]), DEFAULT_GAP);
    assert_eq!(typical_gap(&[3 * HOUR, 2 * HOUR, 0]), 2 * HOUR);
    assert_eq!(typical_gap(&[300, 200, 100]), MIN_GAP);
    assert_eq!(typical_gap(&[20 * DAY, 10 * DAY, 0]), MAX_GAP);
  }

  #[test]
  fn in_game_friend_is_stale_after_an_hour() {
    let (end, starts) = regular(2 * HOUR);
    let p = Persona {
      in_deadlock: true,
      online: true,
      last_seen: None,
    };
    assert!(estimate(NOW, end, &starts, Some(p)).unwrap() > IN_GAME_BOOST);
    let (end, starts) = regular(30 * 60);
    assert_eq!(estimate(NOW, end, &starts, Some(p)), None);
  }

  #[test]
  fn seen_online_after_last_match_and_past_cadence() {
    let (end, starts) = regular(5 * HOUR);
    let seen = Persona {
      last_seen: Some(end + 2 * HOUR),
      ..Default::default()
    };
    assert!(estimate(NOW, end, &starts, Some(seen)).is_some());
    // Offline ever since the last stored match: nothing new to find.
    let gone = Persona {
      last_seen: Some(end + 10 * 60),
      ..Default::default()
    };
    assert_eq!(estimate(NOW, end, &starts, Some(gone)), None);
  }

  #[test]
  fn online_friend_who_stopped_playing_is_not_stale() {
    let (end, starts) = regular(20 * DAY);
    let online = Persona {
      online: true,
      ..Default::default()
    };
    assert_eq!(estimate(NOW, end, &starts, Some(online)), None);
    let in_game = Persona {
      in_deadlock: true,
      ..online
    };
    assert!(estimate(NOW, end, &starts, Some(in_game)).is_some());
  }

  #[test]
  fn seen_online_but_within_cadence_is_not_stale() {
    let (end, starts) = regular(90 * 60);
    let p = Persona {
      online: true,
      ..Default::default()
    };
    assert_eq!(estimate(NOW, end, &starts, Some(p)), None);
  }

  #[test]
  fn cadence_only_fallback() {
    let (end, starts) = regular(5 * HOUR);
    assert!(estimate(NOW, end, &starts, None).is_some());
    assert!(estimate(NOW, end, &starts, Some(Persona::default())).is_some());
    let (end, starts) = regular(3 * HOUR);
    assert_eq!(estimate(NOW, end, &starts, None), None);
    let (end, starts) = regular(20 * DAY);
    assert_eq!(estimate(NOW, end, &starts, None), None);
  }

  #[test]
  fn future_last_match_is_never_stale() {
    let p = Persona {
      in_deadlock: true,
      online: true,
      last_seen: None,
    };
    assert_eq!(estimate(NOW, NOW + 10, &[], Some(p)), None);
  }

  #[test]
  fn pick_orders_by_score_and_truncates() {
    assert_eq!(pick(vec![(1, 5), (2, 50), (3, 20)], 2), vec![2, 3]);
    assert_eq!(pick(vec![(7, 1)], 5), vec![7]);
  }
}
