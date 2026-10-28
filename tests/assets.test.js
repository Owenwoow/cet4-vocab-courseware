"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), {spawnSync} = require("node:child_process");

test("部署兼容本地样式版本号，旧链接和已带版本链接都替换为本次提交版本", () => {
  const html = fs.readFileSync(path.join(__dirname, "../site/index.html"), "utf8");
  assert.match(html, /href="style\.css\?v=[^"\s]+"/, "本地预览必须带样式版本，避免继续命中旧缓存");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/deploy.yml"), "utf8");
  const command = workflow.split(/\r?\n/).find(s => s.trim().startsWith("run: sed -i -E ")).trim().slice(5);
  const bash = process.platform === "win32" ? path.join(process.env.ProgramFiles || "C:/Program Files", "Git/bin/bash.exe") : "/bin/bash";
  const tempRoot = fs.realpathSync(os.tmpdir()), fixture = fs.mkdtempSync(path.join(tempRoot, "cet4-assets-"));
  try {
    fs.mkdirSync(path.join(fixture, "site"));
    const file = path.join(fixture, "site/index.html"), sha = "feedface1234567890abcdef";
    for (const input of [html, html.replace(/style\.css\?v=[^"]+/, "style.css")]) {
      fs.writeFileSync(file, input);
      const result = spawnSync(bash, ["--noprofile", "--norc", "-c", 'PATH="/usr/bin:$PATH"; ' + command], {
        cwd: fixture, env: {...process.env, GITHUB_SHA: sha}, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.error?.message || result.stderr);
      const built = fs.readFileSync(file, "utf8");
      assert.equal((built.match(/href="style\.css\?v=feedfac"/g) || []).length, 1);
      for (const name of ["srs", "recall", "sync", "vocab", "video", "sent", "backup", "app", "study"]) assert.ok(built.includes(`src="${name}.js?v=feedfac"`));
    }
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.ok(resolved.startsWith(tempRoot + path.sep), "仅清理本测试创建的临时目录");
    fs.rmSync(resolved, {recursive: true});
  }
});
