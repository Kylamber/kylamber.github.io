/**
 * Drop-in loader for the Knee Load widget.
 *
 * Usage:
 *   <div id="pose"></div>
 *   <script src="https://imadrian.fyi/pose-widget/embed.js"></script>
 *
 * The loader replaces the container with a responsive iframe. The iframe
 * isolates the widget's CSS and keeps camera/model assets same-origin with
 * the app, while the parent page only needs one script tag.
 *
 * The widget follows the host page's theme by default. It reads the host's
 * data-theme attribute, .dark/.light classes, #theme-switcher checkbox,
 * stored "theme" preference and finally the OS preference, and updates the
 * iframe live when the host theme changes. data-theme="light|dark" forces a
 * fixed theme.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var base;
  try {
    base = new URL(".", script && script.src ? script.src : window.location.href);
  } catch (err) {
    base = new URL(".", window.location.href);
  }

  var ATTRS = [
    ["data-subject-height", "body_height"],
    ["data-mass", "mass"],
    ["data-side", "side"],
    ["data-leg-share", "leg_share"],
    ["data-patellar-arm", "patellar_arm"],
    ["data-model", "model"],
  ];

  function explicitTheme(el) {
    var value = el.getAttribute("data-theme");
    return value === "light" || value === "dark" ? value : null;
  }

  function hostTheme() {
    var html = document.documentElement;
    var body = document.body;

    var attr = (
      html.getAttribute("data-theme") ||
      (body && body.getAttribute("data-theme")) ||
      ""
    ).toLowerCase();
    if (attr === "light" || attr === "dark") return attr;

    if (
      html.classList.contains("dark") ||
      (body && body.classList.contains("dark"))
    ) {
      return "dark";
    }
    if (
      html.classList.contains("light") ||
      (body && body.classList.contains("light"))
    ) {
      return "light";
    }

    var switcher = document.getElementById("theme-switcher");
    if (switcher && switcher.type === "checkbox") {
      return switcher.checked ? "dark" : "light";
    }

    try {
      var stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch (err) {}

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch (err) {
      return "light";
    }
  }

  function buildUrl(el) {
    var url = new URL("app.html", base);
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i][0];
      var param = ATTRS[i][1];
      var value = el.getAttribute(attr);
      if (value !== null && value !== "") url.searchParams.set(param, value);
    }
    url.searchParams.set("theme", explicitTheme(el) || hostTheme());
    return url.toString();
  }

  function postTheme(iframe, theme) {
    if (!iframe || iframe.dataset.poseThemeMode === "fixed") return;
    iframe.style.colorScheme = theme;
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "pose-widget:theme", theme: theme },
          "*",
        );
      }
    } catch (err) {}
  }

  function syncTheme() {
    var theme = hostTheme();
    var frames = document.querySelectorAll("iframe[data-pose-widget]");
    for (var i = 0; i < frames.length; i++) postTheme(frames[i], theme);
  }

  function mount(el) {
    if (!el || el.dataset.poseWidgetMounted === "true") return;
    el.dataset.poseWidgetMounted = "true";

    var height = parseFloat(el.getAttribute("data-height") || "");
    if (!Number.isFinite(height) || height < 320) height = 860;

    var fixedTheme = explicitTheme(el);
    var theme = fixedTheme || hostTheme();

    var iframe = document.createElement("iframe");
    iframe.src = buildUrl(el);
    iframe.title = el.getAttribute("data-title") || "Knee load analysis";
    iframe.setAttribute("data-pose-widget", "");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("allow", "camera; fullscreen; autoplay");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("scrolling", "no");
    iframe.dataset.poseThemeMode = fixedTheme ? "fixed" : "auto";
    iframe.style.cssText = [
      "display:block",
      "width:100%",
      "height:" + Math.round(height) + "px",
      "border:0",
      "overflow:hidden",
      "background:transparent",
      "color-scheme:" + theme,
    ].join(";");

    iframe.addEventListener("load", function () {
      postTheme(iframe, hostTheme());
    });

    if (!el.style.display) el.style.display = "block";
    el.replaceChildren(iframe);
  }

  function init() {
    var nodes = document.querySelectorAll("#pose, [data-pose]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
    startThemeWatcher();
  }

  function unmount(el) {
    if (!el) return;
    var iframe = el.querySelector("iframe[data-pose-widget]");
    if (iframe) iframe.remove();
    delete el.dataset.poseWidgetMounted;
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "pose-widget:height") return;
    var frames = document.querySelectorAll("iframe[data-pose-widget]");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        var h = Number(data.height);
        if (Number.isFinite(h) && h >= 320) {
          frames[i].style.height = Math.round(h) + "px";
        }
        break;
      }
    }
  });

  // Watch the host page for theme changes: class/data-theme changes catch
  // most Hugo themes, including better-default's body.dark/body.light swap;
  // the checkbox and media listener cover the rest.
  var themeWatcher = false;
  function startThemeWatcher() {
    if (themeWatcher) return;
    themeWatcher = true;

    if (window.MutationObserver) {
      var observer = new MutationObserver(syncTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
      if (document.body) {
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["class", "data-theme"],
        });
      }
    }

    function onThemeControl(event) {
      var target = event.target;
      if (target && target.id === "theme-switcher") syncTheme();
    }
    document.addEventListener("change", onThemeControl, true);
    document.addEventListener("input", onThemeControl, true);

    try {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      if (media.addEventListener) {
        media.addEventListener("change", syncTheme);
      } else if (media.addListener) {
        media.addListener(syncTheme);
      }
    } catch (err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Also pick up containers added later by a framework or CMS. Debounce the
  // scan so a busy host page does not trigger a query on every DOM mutation.
  if (window.MutationObserver) {
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        init();
      }, 60);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  window.PoseWidget = {
    mount: mount,
    unmount: unmount,
    init: init,
    version: "1.1.0",
  };
})();
