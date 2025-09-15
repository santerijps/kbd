const overlay = createOverlay("kbd-overlay");
document.body.appendChild(overlay.element);

const Action = {
    DEFAULT: "DEFAULT",
    OPEN_IN_NEW_TAB: "OPEN_IN_NEW_TAB",
    MOUSE_OVER: "MOUSE_OVER",
};

const state = {
    actions: ShortTermMemoryArray(),
    /** @type {Map<string, {element: HTMLElement, hint: HTMLElement}>} */
    elementMap: new Map(),
    input: "",
    /** @type {HTMLElement[]} */
    hints: [],
    modKey: "AltGraph",
    modKeyIsDown: false,
    targetElements: ShortTermMemoryArray(),
};

document.addEventListener("keydown", (event) => {
    console.log(event);

    if (overlay.isVisible()) {
        return;
    }

    if (event.key === state.modKey) {
        state.modKeyIsDown = true;
        return;
    }

    if (!state.modKeyIsDown) {
        return;
    }

    if (event.key === "q") {
        quit();
        return;
    }

    if (event.key === "u") {
        undo();
        return;
    }

    let action = Action.DEFAULT;
    let selectors = null;

    if (event.key === "f") {
        selectors = `a[href], button, [role="button"], [role="menuitem"], [role="submit"], [type="checkbox"], [type="radio"]`;
    }
    else if (event.key === "F") {
        action = Action.OPEN_IN_NEW_TAB;
        selectors = `a[href], audio[src], img[src], video[src]`;
    }
    else if (event.key === "i") {
        selectors = `input[type="text"], textarea`;
    }
    else if (event.key === "µ") {
        selectors = `audio, img, video`;
    }
    else if (event.key === "h") {
        action = Action.MOUSE_OVER;
        selectors = `a[href], button, [role="button"], [role="menuitem"], [role="submit"], [type="checkbox"], [type="radio"]`;
    }

    if (selectors === null) {
        return;
    }

    state.actions.add(action);

    const { elementMap, hints } = generateHints(selectors);
    state.elementMap = elementMap;
    state.hints = hints;

    overlay.setChildren(state.hints);
    overlay.show();

}, true);

document.addEventListener("keyup", (event) => {

    if (event.key === state.modKey) {
        state.modKeyIsDown = false;
        return;
    }

}, true);

overlay.element.addEventListener("keydown", (event) => {

    if (!overlay.isVisible()) {
        return;
    }

    if (event.key === "Escape") {
        state.input = "";
        overlay.hide();
        return;
    }

    if (event.key.length === 1) {
        state.input += event.key;
        const pairs = Array.from(state.elementMap.entries()).filter(([key]) => key.toLowerCase().startsWith(state.input));

        if (pairs.length === 0) {
            state.input = "";
            overlay.hide();
            return;
        }

        state.elementMap = new Map(pairs);
        state.hints = pairs.map((pair) => pair[1].hint);
        overlay.setChildren(state.hints);

        if (state.hints.length !== 1) {
            return;
        }

        const item = state.elementMap.get(state.input.toUpperCase());
        if (item === undefined) { throw Error("unreachable"); }
        const { element: el } = item;
        const action = state.actions.lst();
        state.targetElements.add(el);

        if (action === Action.DEFAULT) {
            el.click();
            if (el.tagName === "INPUT" && el.type === "text" || el.tagName === "TEXTAREA") {
                el.focus();
            }
        }
        else if (action === Action.OPEN_IN_NEW_TAB) {
            open(
                el.tagName === "AUDIO" || el.tagName === "IMG" || el.tagName === "VIDEO"
                    ? el.src
                    : el.href,
                "_blank",
                "noreferer, noopener",
            );
        }
        else if (action === Action.MOUSE_OVER) {
            el.dispatchEvent(new Event("mouseover", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("mouseenter", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event("mousemove", { bubbles: true, cancelable: true }));
        }

        state.input = "";
        overlay.hide();
    }

}, true);

/**
 * @param {string} selectors
 */
function generateHints(selectors) {
    /** @type {HTMLElement[]} */
    const hints = [];

    /** @type {Map<string, HTMLElement>} */
    const elementMap = new Map();

    /** @type {HTMLElement[]} */
    const elements = Array.from(document.querySelectorAll(selectors));
    const idGenerator = HintIdGenerator();

    for (const element of elements) {
        const [visible, style, rect] = getVisibilityInformation(element);

        if (!visible) {
            continue;
        }

        const hintId = idGenerator.next().value;
        const hint = document.createElement("span");
        const hintLeft = rect.x + parseInt(style.paddingLeft);
        const hintTop = rect.y + parseInt(style.paddingTop);

        hint.style.position = "absolute";
        hint.style.left = hintLeft + "px";
        hint.style.top = hintTop + "px";
        hint.style.fontSize = "xx-small";
        hint.style.lineHeight = "normal";
        hint.style.whiteSpace = "nowrap";
        hint.style.zIndex = "100001";
        hint.style.background = "white";
        hint.style.color = "green";
        hint.style.fontFamily = "monospace";
        hint.innerText = hintId;

        hints.push(hint);
        elementMap.set(hintId, { element, hint });
    }

    return { hints, elementMap };
}

/**
 * @param {HTMLElement} element
 * @returns {[true, CSSStyleDeclaration, DOMRect] | [false, null, null]}
 */
function getVisibilityInformation(element) {
    if (!element || !document.documentElement.contains(element)) {
        return [false, null, null];
    }

    // element.computedStyleMap() vs. getComputedStyle(elemennt)
    const innermostChild = findInnermostElementChild(element);

    const style = getComputedStyle(innermostChild);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return [false, null, null];
    }

    const rect = innermostChild.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return [false, null, null];
    }

    const inViewport = rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
        rect.left < (window.innerWidth || document.documentElement.clientWidth);

    if (!inViewport) {
        return [false, null, null];
    }

    // quick obscured test (center point)
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const top = document.elementFromPoint(x, y);

    if (top !== element && !element.contains(top)) {
        return [false, null, null];
    }

    return [true, style, rect];
}

/**
 * @param {string} overlayId
 */
function createOverlay(overlayId) {
    const element = document.createElement("div");
    const input = document.createElement("input");
    let lastActiveElement = document.activeElement;

    element.id = overlayId;
    element.tabIndex = -1;
    element.role = "dialog";

    element.style.width = "100vw";
    element.style.height = "100vh";
    element.style.zIndex = "100000";
    element.style.position = "fixed";
    element.style.inset = "0";
    element.style.display = "none";

    input.type = "text";
    input.style.left = "-999px";
    input.style.position = "absolute";

    const show = () => {
        lastActiveElement = document.activeElement;
        element.style.display = "block";
        element.appendChild(input);
        input.focus({ preventScroll: true });
    };

    const hide = () => {
        element.style.display = "none";
        if (lastActiveElement === null) {
            document.body.focus({ preventScroll: true });
        } else {
            lastActiveElement.focus({ preventScroll: true });
        }
    };

    const isVisible = () => {
        return element.style.display !== "none";
    };

    /**
     * @param {HTMLElement[]} elements
     */
    const setChildren = (elements) => {
        element.innerHTML = "";
        element.append(...elements, input);
        input.focus({ preventScroll: true });
    };

    return { element, show, hide, isVisible, setChildren };
}

/**
 * @param {HTMLElement} element
 */
function findInnermostElementChild(element) {
    let tmp = element;
    while (tmp.childElementCount > 0) {
        tmp = tmp.children[0];
    }
    return tmp;
}

function* HintIdGenerator({ alphabet = 'ASDFCE' } = {}) {
    const A = alphabet.length;
    const max = A * A * A;

    for (let i = 0; ; i++) {
        const a = Math.floor(i / (A * A)) % A;
        const b = Math.floor(i / A) % A;
        const c = i % A;
        yield alphabet[a] + alphabet[b] + alphabet[c];

        if (i >= max) {
            throw Error("ID limit reached!");
        }
    }
}

function ShortTermMemoryArray(maxLength = 10) {
    const array = [];
    return {
        add: (item) => {
            if (array.length === maxLength) {
                array.shift();
            }
            array.push(item);
        },
        pop: () => array.pop(),
        len: () => array.length,
        lst: () => array.length === 0 ? undefined : array[array.length - 1],
    };
}

function quit() {
    state.elementMap.clear();
    state.hints = [];

    while (state.actions.len() > 0) {
        undo();
    }

    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}

function undo() {
    const action = state.actions.pop();
    const targetElement = state.targetElements.pop();
    if (action === undefined || targetElement === undefined) { return; }

    if (action === Action.MOUSE_OVER) {
        targetElement.dispatchEvent(new Event("mouseout", { bubbles: true, cancelable: true }));
        targetElement.dispatchEvent(new Event("mouseleave", { bubbles: true, cancelable: true }));
    }
}
