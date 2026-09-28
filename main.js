/* Fanqie Drafter —— 把当前笔记（或选中内容）写入番茄草稿箱
 * 依赖本地 fanqie-draft-tool（Playwright）：
 *   python batch.py --src <txt> --novel <id> [--headful]
 * 插件只负责导出文本、起进程、实时显示日志。首次使用先在设置里填好
 * Python 路径、batch.py 路径、作品 novel_id，并确保登录态 state 文件有效。
 */
const { Plugin, Modal, Notice, PluginSettingTab, Setting } = require("obsidian");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_SETTINGS = {
  pythonPath: "python",
  scriptPath: "C:\\Users\\lenovo\\Desktop\\novel-ai-writing-system\\src\\fanqie-draft-tool\\batch.py",
  novelId: "",
  headful: false,
  verify: false,
};

module.exports = class FanqieDrafter extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addRibbonIcon("upload", "传到番茄草稿箱", () => this.confirmAndSend());
    this.addCommand({
      id: "send-to-fanqie",
      name: "把当前笔记（或选中内容）传到番茄草稿箱",
      callback: () => this.confirmAndSend(),
    });
    this.addSettingTab(new DrafterSettingTab(this.app, this));
  }

  onunload() {
    if (this.proc) try { this.proc.kill(); } catch (e) {}
    if (this.tmpFile) try { fs.unlinkSync(this.tmpFile); } catch (e) {}
  }

  /** 取选中内容，没有选区就取整篇（去掉 Obsidian 语法尽量保留正文） */
  collectText() {
    const view = this.app.workspace.getActiveViewOfType(require("obsidian").MarkdownView);
    if (!view) return null;
    const editor = view.editor;
    const selected = editor.getSelection();
    let title = view.file ? view.file.basename : "未命名";
    let text = selected && selected.trim() ? selected : editor.getValue();
    if (!text.trim()) return null;
    return { title, text };
  }

  confirmAndSend() {
    const payload = this.collectText();
    if (!payload) {
      new Notice("没有可发送的内容（请打开一篇笔记或选中一段文本）");
      return;
    }
    if (!this.settings.novelId) {
      new Notice("请先在插件设置里填写作品 novel_id");
      this.app.setting.open();
      this.app.setting.openTabById("fanqie-drafter");
      return;
    }
    const m = new Modal(this.app);
    m.contentEl.createEl("h3", { text: "确认发送到番茄草稿箱" });
    m.contentEl.createEl("p", {
      text: `《${payload.title}》 正文约 ${payload.text.replace(/\s/g, "").length} 字 → novel_id ${this.settings.novelId}`,
    });
    m.contentEl.createEl("p", { text: "只存草稿不发布；将启动本地 Playwright 脚本，期间请勿操作同会话浏览器。", cls: "mod-muted" });
    const btns = m.contentEl.createDiv();
    btns.style.cssText = "display:flex; gap:8px; justify-content:flex-end;";
    const cancel = btns.createEl("button", { text: "取消" });
    cancel.onclick = () => m.close();
    const ok = btns.createEl("button", { text: "发送", cls: "mod-cta" });
    ok.onclick = () => { m.close(); this.send(payload); };
    m.open();
  }

  send(payload) {
    // 导出临时 txt（batch.py 会按“第X章”等标记切章）
    this.tmpFile = path.join(os.tmpdir(), `obsidian-fanqie-${Date.now()}.txt`);
    fs.writeFileSync(this.tmpFile, payload.text, "utf8");

    const args = [this.settings.scriptPath, "--src", this.tmpFile, "--novel", this.settings.novelId];
    if (this.settings.headful) args.push("--headful");
    if (this.settings.verify) args.push("--verify");

    const modal = new Modal(this.app);
    modal.contentEl.createEl("h3", { text: "番茄上传中…" });
    const logEl = modal.contentEl.createDiv();
    logEl.style.cssText =
      "font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 50vh; overflow-y: auto; background: var(--background-secondary); padding: 8px; border-radius: 6px;";
    logEl.setText("启动中…\n");
    const closeBtn = modal.contentEl.createEl("button", { text: "关闭（后台继续）" });
    closeBtn.style.marginTop = "8px";
    closeBtn.onclick = () => modal.close();
    modal.open();

    const append = (s) => {
      logEl.textContent += s;
      logEl.scrollTop = logEl.scrollHeight;
    };

    const proc = spawn(this.settings.pythonPath, args, { cwd: path.dirname(this.settings.scriptPath) });
    this.proc = proc;
    proc.stdout.on("data", (d) => append(d.toString("utf8")));
    proc.stderr.on("data", (d) => append(d.toString("utf8")));
    proc.on("error", (e) => {
      append(`\n进程启动失败：${e.message}\n请检查设置里的 Python 路径与 batch.py 路径。`);
      new Notice("番茄上传：进程启动失败");
    });
    proc.on("close", (code) => {
      append(`\n—— 进程退出，code=${code} ——`);
      if (code === 0) new Notice("番茄上传完成");
      try { fs.unlinkSync(this.tmpFile); } catch (e) {}
      this.tmpFile = null;
      this.proc = null;
    });
  }

  async saveSettings() { await this.saveData(this.settings); }
};

class DrafterSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Python 路径").addText((t) =>
      t.setPlaceholder("python").setValue(this.plugin.settings.pythonPath).onChange(async (v) => {
        this.plugin.settings.pythonPath = v.trim() || "python"; await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("batch.py 路径")
      .setDesc("fanqie-draft-tool 的 batch.py 绝对路径").addText((t) =>
      t.setValue(this.plugin.settings.scriptPath).onChange(async (v) => {
        this.plugin.settings.scriptPath = v.trim(); await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("作品 novel_id").setDesc("番茄作品在后台 URL 中的数字 id").addText((t) =>
      t.setValue(this.plugin.settings.novelId).onChange(async (v) => {
        this.plugin.settings.novelId = v.trim(); await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("显示浏览器窗口 (--headful)").addToggle((t) =>
      t.setValue(this.plugin.settings.headful).onChange(async (v) => {
        this.plugin.settings.headful = v; await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("上传后回读校验 (--verify)").addToggle((t) =>
      t.setValue(this.plugin.settings.verify).onChange(async (v) => {
        this.plugin.settings.verify = v; await this.plugin.saveSettings();
      }));
  }
}
