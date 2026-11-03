/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * 2026-11 Discord 更新后的回归：在表情选择器里选完表情，选择器关掉了，但焦点留在了工具栏
 * 那个表情按钮上。于是紧接着按回车不是"发送消息"，而是又点了一次那个按钮 —— 表情栏重新
 * 弹开，消息发不出去。老版本选完表情会把焦点还给输入框，这条插件把那个行为补回来。
 *
 * 触发点有两个（对应两种选表情的方式）：
 *   · 用鼠标点表情格子 —— 格子的类名族是 `emojiItem_<hash>`；
 *   · 在搜索框里按回车选中高亮项 —— 事件目标是选择器内部。
 * 两者都只是"可能选中了"，所以真正动手前先等选择器从 DOM 里消失；如果它没关（比如点歪了、
 * 或者那一下只是切标签页），就什么都不做，绝不抢焦点。
 *
 * 为什么用 DOM 选择器而不是 webpack 查找器：这件事整个发生在焦点/DOM 层，没有可打的组件
 * 方法。选择器都是在 Discord 1.0.9266 的线上包里实测过的（`emojiItem_fc7141`、
 * `emojiPicker_c0e32c`、`data-slate-editor`），不是猜的。任一选择器失配的后果是"插件不做事"，
 * 不是崩客户端 —— 所有查询都包在 try 里，事件回调里不抛。
 *
 * 焦点回给谁：记住最后一个被聚焦过的输入框（`focusin` 里记），所以正在编辑某条消息时选表情
 * 会回到编辑框，平时回到主输入框；那个节点已经不在了才退回"文档里最后一个 Slate 编辑器"。
 */

import definePlugin from "@utils/types";

/** 表情格子。新旧两套选择器实现共用 `emojiItem` 前缀（实测 `emojiItem_fc7141`）。 */
const CELL_SELECTOR = '[class*="emojiItem"]';
/** 选择器外壳，含 `emojiPicker_<hash>` / `emojiPickerListWrapper_` 等同一族。 */
const PICKER_SELECTOR = '[class*="emojiPicker"]';
/** Slate 的框架属性（不是样式类），Discord 的输入框/编辑框都带它。 */
const EDITOR_SELECTOR = '[data-slate-editor="true"]';

/** 最后一次拿到焦点的那个输入框。 */
let lastEditor: HTMLElement | null = null;
/** 轮询用的定时器 + 代号：新一代请求进来就作废上一代，避免两次选择互相打架。 */
let timer: number | undefined;
let generation = 0;

function query<T extends Element>(selector: string): T | null {
    try {
        return document.querySelector<T>(selector);
    } catch {
        return null;
    }
}

function activeEditor(): HTMLElement | null {
    if (lastEditor?.isConnected) return lastEditor;
    try {
        const editors = document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR);
        return editors.length ? editors[editors.length - 1] : null;
    } catch {
        return null;
    }
}

function focusEditor(): void {
    const editor = activeEditor();
    if (!editor || document.activeElement === editor) return;
    try {
        // preventScroll：Discord 的输入框贴底，别让浏览器为了"看见焦点"抖一下页面。
        editor.focus({ preventScroll: true });
        // Slate 一般自己会把光标放回去；只有选区压根不在编辑器里时才兜底挪到末尾，
        // 否则会把用户原本插在中间的插入点弄到结尾。
        const selection = window.getSelection();
        if (selection && (selection.rangeCount === 0 || !editor.contains(selection.anchorNode))) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } catch { /* 焦点问题不该影响任何别的功能 */ }
}

/** 选择器是不是还开着。"关了"不等于"从 DOM 里没了"——也可能是被藏起来，两种都算关。 */
function pickerOpen(): boolean {
    const el = query<HTMLElement>(PICKER_SELECTOR);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/** 等选择器关掉，再把焦点还回去。 */
function restoreFocusSoon(): void {
    const gen = ++generation;
    clearTimeout(timer);

    const step = (attempt: number) => {
        if (gen !== generation) return;
        // 选择器还在 ⇒ 还没选完（或根本没关），继续等。
        if (pickerOpen()) {
            if (attempt < 12) timer = window.setTimeout(() => step(attempt + 1), 40);
            return;
        }
        focusEditor();
        // 新版 Discord 有可能在关闭后紧接着把焦点送回触发按钮；再补一次盖过它。
        timer = window.setTimeout(() => {
            if (gen === generation) focusEditor();
        }, 120);
        // 关闭动画结束后才把焦点写回按钮的情况：只在"焦点确实停在按钮上"时纠正，
        // 这样用户这时已经点到别处（焦点是 body 或别的地方）就不会被抢回来。
        timer = window.setTimeout(() => {
            if (gen === generation && document.activeElement instanceof HTMLButtonElement) focusEditor();
        }, 400);
    };

    step(0);
}

function onClick(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target?.closest) return;
    if (!target.closest(CELL_SELECTOR)) return;
    restoreFocusSoon();
}

function onKeyDown(event: KeyboardEvent): void {
    // 只认"在选择器里按了个干净的回车"：带修饰键或正在输入法组字时不算。
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target as Element | null;
    if (!target?.closest) return;
    if (!target.closest(PICKER_SELECTOR)) return;
    restoreFocusSoon();
}

function onFocusIn(event: FocusEvent): void {
    const target = event.target as Element | null;
    if (!target?.closest) return;
    const editor = target.closest(EDITOR_SELECTOR);
    if (editor instanceof HTMLElement) lastEditor = editor;
}

export default definePlugin({
    name: "EmojiPickerFocus",
    description: "选完表情后把焦点还给输入框——还原 2026-11 更新前「选表情 → 回车发送」的行为",
    enabledByDefault: true,
    authors: [{ name: "Aqua", id: 0n }],

    start() {
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("focusin", onFocusIn, true);
    },

    stop() {
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
        generation++;
        clearTimeout(timer);
        lastEditor = null;
    }
});
