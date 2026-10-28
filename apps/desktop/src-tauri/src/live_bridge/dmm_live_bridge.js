"use strict";

// Deadlock Mod Manager live bridge.
//
// Loaded by citadel_hud_top_bar_team, so one copy runs per team panel of the
// top bar. It reads the values the game already puts on each player's top-bar
// panel (the ones the scoreboard shows) and prints them to the console. With
// -condebug the console goes to console.log, which the mod manager reads.
//
// Only scoreboard values are read: name, hero, souls, level, K/D/A and
// objective damage. Nothing here touches positions, cooldowns or anything the
// HUD does not already show.
//
// Panorama cannot read a dialog variable directly, but $.Localize resolves one
// against a panel and its parents, which is how a label bound to {i:kills}
// gets its text.

(function () {
  var TAG = "[DMM-LIVE]";
  var DIAG_TAG = "[DMM-LIVE-DIAG]";
  var ROSTER_TAG = "[DMM-LIVE-ROSTER]";
  var VERSION = 1;
  var TICK_SECONDS = 2;
  // Unchanged boards are repeated this often so the app can tell a quiet match
  // from a bridge that stopped.
  var HEARTBEAT_SECONDS = 20;

  var root = $.GetContextPanel();
  var lastLine = "";
  var lastEmit = 0;
  var elapsed = 0;
  var diagnosed = false;

  var resolve = function (token, panel) {
    try {
      var text = $.Localize(token, panel);
      if (typeof text !== "string" || text === "" || text.indexOf("{") !== -1) {
        return null;
      }
      return text;
    } catch (error) {
      return null;
    }
  };

  var resolveInt = function (tokens, panel) {
    for (var i = 0; i < tokens.length; i++) {
      var text = resolve(tokens[i], panel);
      if (text === null) continue;
      var value = parseInt(text.replace(/[^0-9-]/g, ""), 10);
      if (!isNaN(value)) return value;
    }
    return null;
  };

  // The top bar styles parts of some values, e.g. souls read as
  // `2.0<span class="demote">k</span>`.
  var stripTags = function (text) {
    return text === null ? null : text.replace(/<[^>]*>/g, "");
  };

  // The clock's dialog variable lives on a panel the team panel cannot see up
  // its parent chain, so it is read from the top bar's own clock label.
  var clockLabel = null;
  var readClock = function () {
    var direct = resolve("{s:game_clock}", root);
    if (direct !== null) return direct;
    if (!clockLabel || (clockLabel.IsValid && !clockLabel.IsValid())) {
      clockLabel = null;
      var top = root;
      while (top && top.paneltype !== "CitadelHudTopBar" && top.GetParent) {
        top = top.GetParent();
      }
      if (top && top.FindChildTraverse) {
        clockLabel = top.FindChildTraverse("GameTime");
      }
    }
    if (!clockLabel) return null;
    var resolved = resolve("{s:game_clock}", clockLabel);
    if (resolved !== null) return resolved;
    var text = typeof clockLabel.text === "string" ? clockLabel.text : "";
    return text !== "" && text.indexOf("{") === -1 ? stripTags(text) : null;
  };

  var hasClass = function (panel, name) {
    try {
      return !!(panel.BHasClass && panel.BHasClass(name));
    } catch (error) {
      return false;
    }
  };

  var childrenOf = function (panel) {
    try {
      return panel.Children ? panel.Children() : [];
    } catch (error) {
      return [];
    }
  };

  // The panels that carry a player's dialog variables. Lookups walk up to the
  // parents, so every label inside a player panel resolves too: stopping at the
  // first panel that resolves keeps each player once.
  var findPlayerPanels = function (panel, found, depth) {
    if (depth > 12) return;
    var children = childrenOf(panel);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (resolve("{s:player_name}", child) !== null) {
        found.push(child);
      } else {
        findPlayerPanels(child, found, depth + 1);
      }
    }
  };

  var readPlayer = function (panel) {
    return {
      n: resolve("{s:player_name}", panel),
      hid: resolveInt(["{i:hero_id}", "{d:hero_id}"], panel),
      hn: resolve("{s:hero_name}", panel),
      s: stripTags(resolve("{s:gold}", panel)),
      l: resolveInt(["{i:player_level}"], panel),
      k: resolveInt(["{i:kills}"], panel),
      d: resolveInt(["{i:deaths}"], panel),
      a: resolveInt(["{i:assists}"], panel),
      o: resolveInt(["{i:objective_damage}"], panel),
      me: hasClass(panel, "LocalPlayer"),
      dead: hasClass(panel, "Dead"),
    };
  };

  var side = function () {
    if (root.id === "TeamFriendly") return "friendly";
    if (root.id === "TeamEnemy") return "enemy";
    return root.id || "unknown";
  };

  // What the labels under the team panel show. If the dialog variables cannot
  // be resolved, this is what tells whether reading label text would work.
  var sampleLabels = function (panel, out, depth) {
    if (depth > 12 || out.length >= 16) return;
    var children = childrenOf(panel);
    for (var i = 0; i < children.length && out.length < 16; i++) {
      var child = children[i];
      if (child.paneltype === "Label") {
        out.push((child.id || "?") + "=" + String(child.text).slice(0, 24));
      }
      sampleLabels(child, out, depth + 1);
    }
  };

  var hudRoot = function () {
    var panel = root;
    while (panel && panel.GetParent && panel.GetParent())
      panel = panel.GetParent();
    return panel;
  };

  var textOf = function (panel) {
    if (!panel) return null;
    if (
      typeof panel.text === "string" &&
      panel.text !== "" &&
      panel.text.indexOf("{") === -1
    ) {
      return panel.text;
    }
    var children = childrenOf(panel);
    for (var i = 0; i < children.length; i++) {
      var text = textOf(children[i]);
      if (text !== null) return text;
    }
    return null;
  };

  // Whatever identifies the account behind an avatar. Which of these the
  // game's avatar panel exposes is not documented, so every likely one is read.
  var avatarIds = function (avatar) {
    var ids = {};
    var keys = ["steamid", "accountid", "steamId", "accountId", "xuid"];
    for (var i = 0; i < keys.length; i++) {
      try {
        var value = avatar[keys[i]];
        if (
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== 0
        ) {
          ids[keys[i]] = String(value);
        }
      } catch (error) {}
      try {
        var attribute = avatar.GetAttributeString
          ? avatar.GetAttributeString(keys[i], "")
          : "";
        if (attribute) ids["attr_" + keys[i]] = attribute;
      } catch (error) {}
    }
    return ids;
  };

  // The pre-match versus screen lists every player with their avatar, which is
  // the one place the HUD ties a name to an account.
  var lastRoster = "";
  var readRoster = function () {
    var top = hudRoot();
    if (!top || !top.FindChildTraverse) return;
    var teams = [];
    var lists = ["Team1Players", "Team2Players"];
    for (var t = 0; t < lists.length; t++) {
      var list = top.FindChildTraverse(lists[t]);
      if (!list) continue;
      var players = [];
      var entries = childrenOf(list);
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var avatar = entry.FindChildTraverse
          ? entry.FindChildTraverse("AvatarImage")
          : null;
        var name = entry.FindChildTraverse
          ? entry.FindChildTraverse("UserName")
          : null;
        players.push({ n: textOf(name), ids: avatar ? avatarIds(avatar) : {} });
      }
      teams.push({ t: t + 1, players: players });
    }
    if (teams.length === 0) return;
    var line = JSON.stringify({ v: VERSION, teams: teams });
    if (line !== lastRoster) {
      $.Msg(ROSTER_TAG + " " + line);
      lastRoster = line;
    }
  };

  var diagnose = function (panels) {
    diagnosed = true;
    var types = [];
    for (var i = 0; i < panels.length; i++) {
      types.push(panels[i].paneltype + "#" + panels[i].id);
    }
    var labels = [];
    sampleLabels(root, labels, 0);
    $.Msg(
      DIAG_TAG +
        " " +
        JSON.stringify({
          v: VERSION,
          side: side(),
          root: root.paneltype + "#" + root.id,
          players: panels.length,
          panels: types,
          sample: panels.length > 0 ? readPlayer(panels[0]) : null,
          clock: readClock(),
          labels: labels,
        }),
    );
  };

  var tick = function () {
    if (!root || (root.IsValid && !root.IsValid())) return;
    elapsed += TICK_SECONDS;

    var panels = [];
    findPlayerPanels(root, panels, 0);
    if (!diagnosed && (panels.length > 0 || elapsed >= 30)) {
      diagnose(panels);
    }

    if (panels.length > 0) {
      var players = [];
      for (var i = 0; i < panels.length; i++) {
        players.push(readPlayer(panels[i]));
      }
      var line = JSON.stringify({
        v: VERSION,
        side: side(),
        clock: readClock(),
        players: players,
      });
      if (line !== lastLine || elapsed - lastEmit >= HEARTBEAT_SECONDS) {
        $.Msg(TAG + " " + line);
        lastLine = line;
        lastEmit = elapsed;
      }
    }

    // Two copies run, one per team panel; one roster is enough.
    if (side() === "friendly") readRoster();

    $.Schedule(TICK_SECONDS, tick);
  };

  $.Schedule(TICK_SECONDS, tick);
})();
