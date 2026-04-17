console.log("🔴 NEW route_workspace_pin.js LOADED");
(function () {
  const FIXED_WORKSPACE = "main-home";

  function patch_sidebar() {
    const sidebar = frappe?.app?.sidebar;
    if (!sidebar) return false;

    // Permanently block show_sidebar_for_module
    sidebar.show_sidebar_for_module = function() { return; };

    // Force our workspace
    try { sidebar.setup(FIXED_WORKSPACE); } catch(e) {}

    return true;
  }

  function keep_patching() {
    // Keep trying until sidebar is available
    let attempts = 0;
    const t = setInterval(() => {
      attempts++;
      const ok = patch_sidebar();
      if (ok || attempts > 100) clearInterval(t);
    }, 100);
  }

  // Run on every page change
  $(document).on("page-change", function() {
    patch_sidebar();
    setTimeout(patch_sidebar, 100);
    setTimeout(patch_sidebar, 500);
  });

  // Also intercept frappe.app setter in case sidebar loads late
  const _ready = frappe.ready || frappe.after_ajax;
  if (_ready) {
    _ready(function() {
      keep_patching();
    });
  }

  keep_patching();

})();
