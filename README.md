# EmojiPickerFocus（Vencord 插件）

Discord 2026-11 更新后的回归修复：在表情选择器里选完表情、选择器关掉之后，焦点留在了工具栏
那个表情按钮上，于是紧接着按回车不是「发送消息」，而是又点了一次那个按钮——表情栏重新弹开。
这个插件把焦点还给输入框，恢复「选表情 → 回车发送」。

## 安装

需要**源码构建的 Vencord**（installer 版装不了 userplugin）。把本目录放到 Vencord 仓库的
`src/userplugins/emojiPickerFocus`：

```bash
git clone https://github.com/Aqua-aries1/emojiPickerFocus src/userplugins/emojiPickerFocus
pnpm build
```

重启 Discord 生效。插件默认启用。

- Vencord **1.15.x**。
- 两条选表情的路径都覆盖：鼠标点表情格子；在搜索框里按回车选中高亮项。
- 只有选择器**真的关掉**之后才动焦点——点歪了、只是切了个标签页，都不会被抢焦点。
- 焦点回给「最后一个被聚焦过的输入框」：正在编辑某条消息时选表情，回到编辑框；平时回主输入框。

## 实现

纯 DOM 层，没有 webpack 查找器——这件事整个发生在焦点/DOM 层，没有可打的组件方法。
选择器（`emojiItem_*` / `emojiPicker_*` / `data-slate-editor`）是在 Discord 1.0.9266 的线上包里
实测过的，不是猜的。任一选择器失配的后果是「插件不做事」，不是崩客户端——所有查询都包在 try
里，事件回调里不抛。

## 许可

GPL-3.0-or-later，全文见 `LICENSE`。
