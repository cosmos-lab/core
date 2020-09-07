"use strict";

/**
 * 
 * https://github.com/orientedjs/core 
 * v2.0.0 Sep 4 2020
 * Achieve data driven dynamic HTML with the power of ECMAScript.
 * Parse inline or external file HTML template with a Javascript 'Class' object as scope.
 * Insert generated HTML to the container provided
 * @param  {Object} container String selector or reference of DOM object.
 * @param  {JSON Object} scope Data object. Could be any javascript object or class instance. Containing data used in template.
 * @param  {String} template (Optional, if external template file used!) a URL to template which is accessible via XMLhttp request.
 * @return {OrnCollection} OrnCollection of container  
 *  
 */

const Orns = (selector, scope, template) => {

    const container = new OrnCollection(selector);

    if (!container.get()) {
        Orn.debug && console.log(`DYM-ERROR: Container not found for selector "${selector}"`, scope, selector);
        return;
    }

    if (typeof template != 'undefined') {
        template = new OrnTemplate(template);
    } else {
        template = new OrnTemplate(container.get());
    }

    const vdom = template.ProcesS();

    while (container.get().firstChild) {
        container.get().removeChild(container.get().firstChild);
    }

    vdom.map((dom) => {

        let shared = scope instanceof Array ? scope : [scope];

        OrnParser.Output(OrnParser.Process(OrnParser.Clone(dom), false, 0, shared), container.get());

    });

    return container;

};

const Orn = async(selector, scope, template) => {

    const container = new OrnCollection(selector);

    if (!container.get()) {
        Orn.debug && console.log(`DYM-ERROR: Container not found for selector "${selector}"`, scope, selector);
        return;
    }

    if (typeof template != 'undefined') {
        template = new OrnTemplate(template);
    } else {
        template = new OrnTemplate(container.get());
    }

    const vdom = await template.Process();

    while (container.get().firstChild) {
        container.get().removeChild(container.get().firstChild);
    }

    vdom.map((dom) => {

        let shared = scope instanceof Array ? scope : [scope];

        OrnParser.Output(OrnParser.Process(OrnParser.Clone(dom), false, 0, shared), container.get());

    });

    var list = container.find('orn-component');

    for (var i = 0; i < list.length; i++) {

        let element = new OrnCollection(list[i]);

        if (typeof element._Loaded != 'undefined') {
            continue;
        }

        if (element.attr('src')) {
            await LazyLoad(element.attr('src'));
            element.attr('src', false, true);
        }

        var component = new Function([], `return ${element.get().identifier}`)();

        var object = new component(element.get(), element.get().shared);

        element.get().component = object;

        if (typeof object.Init != 'undefined') {
            await object.Init();
        }

        element._Loaded = true;

    }

    list = container.find('orn-template');

    for (var i = 0; i < list.length; i++) {

        let element = list[i];

        let src = element.getAttribute('src');

        if (!src) {
            Orn.debug && console.log(`DYM-ERROR: Template src not found:`, element);
            continue;
        }

        if (element._Loaded) {
            continue;
        }

        var local = element.shared;

        await Orn(element, [scope, local], src);

        element._Loaded = true;
    }

    return container;

};

class OrnTemplate {

    constructor(template) {

        this.template = template;

    }

    async Process() {

        var vdom = false;

        if (this.IsElement()) {
            vdom = this.Parse(this.template).children;
        } else if (this.IsURL()) {
            vdom = await this.LoadHTML();
        } else {
            vdom = this.VDOM(this.template);
        }

        return vdom;

    }

    async LoadHTML() {

        const template = this.template;

        if (typeof OrnTemplate.cache[template] == 'undefined') {

            OrnTemplate.cache[template] = true;
            var response = await fetch(template, {
                cache: 'force-cache'
            });
            if (!response.ok) {
                throw Error(`${template} not found or internet connection error.`);
                return;
            }
            response = await response.text();

            OrnTemplate.cache[template] = this.VDOM(response);

        }

        if (OrnTemplate.cache[template] === true) {
            /* 
                OrnTemplate.cache[template] is true it means some call already request for same template.
                For handling concurrent request of same template. 
                Wait for all request until first templates loads to OrnTemplate.cache[template] 
            */
            await new Promise((resolve, reject) => {
                SleepUntil(function() {
                    var Loaded = OrnTemplate.cache[template] !== true;
                    if (!Loaded) {
                        return false;
                    }
                    resolve();
                    return true;
                });
            });

        }

        return OrnTemplate.cache[template];

    }

    ProcesS() {
        var vdom = false;

        if (this.IsElement()) {
            vdom = this.Parse(this.template).children;
        } else {
            vdom = this.VDOM(this.template);
        }

        return vdom;
    }

    IsURL() {
        return !this.template.match(/(\<.*\>)|\n/gi);
    }

    IsElement() {
        return typeof this.template != 'string';
    }

    VDOM(html) {

        /* Genesis container for maintaining virtual DOM from template loaded */

        let container = document.createElement('div');

        container.innerHTML = html;

        let element = this.Parse(container);

        return element.children;

    }

    Parse(el, module) {

        var dom = {
            tag: el.nodeName.toLowerCase(),
            attributes: []
        };

        if (dom.tag === '#comment') {
            return;
        }

        if (dom.tag == 'option') {
            dom.html = el.text;
        }

        if (dom.tag == '#text') {
            dom.text = el.textContent;
            return dom;
        }

        if (dom.tag == 'style') {
            document.body.append(el);
            return dom;
        }

        for (var a = 0; a < el.attributes.length; a++) {

            var attr = el.attributes[a];

            dom.attributes.push({
                name: attr.name,
                value: attr.value
            });

            if (attr.name === 'orn-module' && !module) {
                var template = attr.value;
                if (!OrnTemplate.cache[template]) {
                    OrnTemplate.cache[template] = this.Parse(el, true);
                } else {
                    return OrnTemplate.cache[template];
                }
            }
        }

        dom.children = [];

        for (var c = 0; c < el.childNodes.length; c++) {

            var ch = el.childNodes[c];

            var t = this.Parse(ch);

            dom.children.push(t);

        }

        return dom;

    }

}

OrnTemplate.cache = {};

class OrnCollection extends Array {

    constructor(selector, parent) {

        super();

        if (parent && !(parent instanceof Array)) {
            parent = [parent];
        }

        parent = parent ? parent : [document];

        for (let i = 0; i < parent.length; i++) {

            var list = [];

            if (selector instanceof Array) {

                list = selector;

            } else if (typeof selector == "object") {

                list = [selector];

            } else if (selector) {

                selector = selector.split(',');

                for (let s = 0; s < selector.length; s++) {
                    list = list.concat(Array.from(parent[i].querySelectorAll(selector[s])));
                }

            }

            for (let j = 0; j < list.length; j++) {

                this.push(list[j]);

            }

        }

    }

    get(i) {
        return this.length ? this[i ? i : 0] : false;
    }

    parent() {
        return new OrnCollection(this.length ? this[0].parentNode : false);
    }

    first() {
        return new OrnCollection(this[0]);
    }

    last() {
        return new OrnCollection(this[this.length - 1]);
    }

    next() {
        return new OrnCollection(this[0].nextSibling);
    }

    prev() {
        return new OrnCollection(this[0].previousSibling);
    }

    siblings(selector) {

        selector = selector ? selector : '*';

        var t = this;

        var obj = new OrnCollection(Array.from(this.length && this.get().parentNode ? this.get().parentNode.children : []));

        obj = obj.filter(function(item) {
            return item != t.get() && item.matches(selector);
        });

        return obj;
    }

    empty() {
        this.forEach((el) => {
            while (el.firstChild) {
                el.removeChild(el.firstChild);
            }
        });
        return this;
    }

    remove() {

        this.forEach((e) => {
            e.parentNode && e.parentNode.removeChild(e);
        });

    }

    css(c, action) {

        if (typeof action == 'undefined') {
            return this.length && this.get().classList.contains(c);
        }

        const parts = c.split(' ');

        if (action === false) {

            this.forEach((el) => {
                parts.forEach((it) => {
                    el.classList.remove(it);
                });
            });

            return this;

        }

        this.forEach((el) => {

            parts.forEach((it) => {
                el.classList.add(it);
            });

        });

        return this;

    }

    style(k, v) {

        if (typeof v == 'undefined') {
            return this.get().style.getPropertyValue(k);
        }

        this.forEach((el) => {
            if (v === false) {
                el.style.removeProperty(k);
            }
            el.style.setProperty(k, v);
        });

        return this;

    }

    toggle(c1, c2) {

        if (typeof c2 != 'undefined') {
            this.forEach((el) => {
                el.innerHTML = el.innerHTML == c2 ? c1 : c2;
            });
        } else {
            this.forEach((el) => {
                el.classList.toggle(c1);
            });
        }

        return this;

    }

    hide() {

        this.forEach((e) => {
            e.style.display = 'none';
        });

        return this;

    }

    show() {

        this.forEach((el) => {
            delete el.style.removeProperty('display');
        });

        return this;

    }

    append(h, pre) {

        this.forEach((e) => {

            if (typeof h == 'string') {

                var div = document.createElement('div');
                div.innerHTML = h.trim();
                h = div.firstElementChild;

            }

            if (typeof pre != 'undefined' && e.firstChild) {

                e.insertBefore(h, e.firstElementChild);

            } else {

                e.append(h);

            }

        });

        return this;

    }

    html(value) {

        if (typeof value == 'undefined') {
            if (!this.length) {
                return '';
            }
            return this.get().innerHTML;
        }

        this.forEach((e) => {
            e.innerHTML = value;
        });

        return this;
    }

    find(s) {
        return new OrnCollection(s, this);
    }

    attr(k, v, remove) {

        if (v || remove) {

            this.forEach((e) => {
                if (remove) {
                    e.removeAttribute(k, v);
                } else {
                    e.setAttribute(k, v);
                }
            });

            return this;

        } else {

            return this.get().getAttribute(k);

        }

    }

    each(handler) {

        this.forEach((e) => {
            typeof handler.call(e, e);
        });

        return this;

    }

    event(type, handler) {

        if (!handler) {

            this.forEach((el) => {
                var e = document.createEvent('HTMLEvents');
                e.initEvent(type, true, true);
                el.dispatchEvent(e);
            });

            return this;

        }

        this.forEach((el) => {
            el.addEventListener(type, (event) => {
                handler.call(el, event);
            });
        });

        return this;

    }

    delegate(s, event, handler, bubble) {

        this.each((el) => {

            el.addEventListener(event, (e) => {

                var targets = new OrnCollection(s);
                var target = false;
                var item = e.target;

                while (item) {

                    targets.each((el) => {
                        if (item == el) {
                            target = item;
                            e.stopPropagation();
                        }
                    });

                    item = item.parentNode;

                }

                if (target) {
                    handler.call(target, e);
                }

            }, typeof bubble != 'undefined');

        });
    }

    offset(type) {

        var el = this.get();

        return {
            width: el.offsetWidth,
            height: el.offsetHeight,
            left: el.offsetLeft,
            top: el.offsetTop
        };
    }

    children(type) {

        var children = [];

        this.each((element) => {
            children = children.concat(Array.from(element.children));
        });

        return new OrnCollection(children);

    }

    ancestor(selector, element) {

        let select = new OrnCollection(selector).get();

        if (!element) {
            element = this.get();
        }

        var parent = element.parentNode;
        if (!parent || parent == document.body) {
            return false;
        }

        if (select == parent) {
            return parent;
        }

        return this.ancestor(selector, parent);

    }

}

class OrnParser {

    /**
     * HTML Template Parser
     * @param  {Object} node  - OrnTemplate node. Representation of DOM in Javascript Object
     * @param  {Object} parent - OrnTemplate node
     * @param  {Integer} index - index of node inside parent.children
     * @param  {Object} attribute - attribute object of node 
     * @param  {Object} scope - data object. Could be any javascript object or class instance. Containing data used in 'node'
     *  
     */

    constructor(node, parent, index, attribute, scope) {

        this.scope = scope;
        this.node = node;
        this.parent = parent;
        this.index = index;
        this.attribute = attribute;

    }

    static Clone(obj) {

        var copy;
        if (null == obj || "object" != typeof obj) {
            return obj;
        }

        if (obj instanceof Date) {
            copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        if (obj instanceof Array) {
            copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = OrnParser.Clone(obj[i]);
            }
            return copy;
        }

        if (obj instanceof Object) {
            copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr))
                    copy[attr] = OrnParser.Clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    }

    static Process(node, parent, index, scope) {

        if (typeof index == 'undefined') {
            index = 0;
        }

        if (!node || !node.tag) {
            Orn.debug && console.log('DYM-ERROR: Invalid HTML tag', arguments);
            return;
        }

        const tag = node.tag;

        if (tag === '#comment') {
            return node;
        }

        if (tag === '#text') {

            var match = node.text.match(/\{\{(.*?)\}\}/gi);

            if (match !== null) {

                parser = new OrnParser(node, parent, index, false, scope);

                for (var i = 0; i < match.length; i++) {
                    let __v = parser.Parse(match[i].replace(/\{\{|\}\}/gi, ''));
                    node.text = node.text.replace(match[i], __v);
                }

            }

            return node;
        }

        var skip = false;

        const itrate = node.attributes.find((a) => {
            return a.name == 'orn-repeat';
        });

        if (itrate) {
            itrate.index = node.attributes.indexOf(itrate);
            const parser = new OrnParser(node, parent, index, itrate, scope);
            parser.Repeat();
            return;
        }

        for (let a = 0; a < node.attributes.length; a++) {

            let attr = node.attributes[a];

            if (!/^orn-/.test(attr.name) || skip) {
                continue;
            }

            attr.index = a;

            var parser = new OrnParser(node, parent, index, attr, scope);

            switch (true) {

                case attr.name === 'orn-module':

                    break;

                case (/^orn-on/.test(attr.name)):

                    parser.OnEvent();

                    break;

                case attr.name === 'orn-show':

                    parser.Show();

                    break;
                case attr.name === 'orn-model':

                    parser.InputModel();

                    break;
                case attr.name === 'orn-class':

                    parser.CSSClass();

                    break;
                case attr.name === 'orn-style':

                    parser.CSSStyle();

                    break;

                case attr.name === 'orn-if':

                    var f = parser.Condition();

                    if (!f) {
                        skip = true;
                    }

                    break;

                case attr.name === 'orn-checked' || attr.name === 'orn-selected' || attr.name === 'orn-disabled':

                    parser.InputState();

                    break;

                default:

                    parser.Attribute();
            }

        }

        if (node.children && node.children.length) {

            for (let index in node.children) {

                var child = node.children[index];
                OrnParser.Process(child, node, index, scope);

            }

        }

        return node;
    }

    static Output(json, parent) {

        if (!json || !json.tag) {
            return;
        }

        if (json.text) {

            var text = json.text;

            if (typeof json.text == 'function') {
                text = json.text(el);
            }

            if (parent.isOption) {
                parent.text = text;
            } else {
                parent.appendChild(document.createTextNode(text));
            }

            return;

        }

        var el = document.createElement(json.tag);

        for (var i = 0; i < json.attributes.length; i++) {

            var a = json.attributes[i];

            if (typeof a.value == 'undefined') {

                continue;

            }

            if ((a.name[0] + a.name[1]) === 'on') {

                el.addEventListener(a.name.replace('on', ''), (function(f) {
                    return function(event) {

                        if (this.model) {
                            this.model(event);
                        }

                        if (typeof(f) === 'string') {

                            var fu = new Function('a', f);
                            fu.call(this, event, el);
                            return;
                        }

                        f(event, el);
                    };
                })(a.value));

            } else if (a.name === 'value') {

                el.value = a.value;

            } else if (a.name === 'model') {

                el['model'] = (function(f) {
                    return function(event) {

                        this.event = event;

                        if (typeof(f) === 'string') {

                            var fu = new Function('a', f);
                            fu.call(this);
                            return;
                        }

                        f(this);
                    };
                })(a.value);

                (function(f, el) {
                    el.addEventListener('change', function(event) {
                        this.model(event);
                    });
                    el.addEventListener('keyup', function(event) {
                        this.model(event);
                    });
                })(a.value, el);


            } else if (a.name === 'show') {

                el['show'] = (function(f) {
                    return function() {
                        if (typeof(f) === 'string') {
                            var fu = new Function('a', f);
                            fu.call(this);
                            return;
                        }

                        f(this);
                    };
                })(a.value);

                el.setAttribute('orn-show', "");

            } else if (a.value !== null) {

                if (typeof a.value == 'function') {
                    a.value = a.value(el);
                }

                if (typeof a.value == 'object' || a.name == 'identifier') {
                    new Function(['value'], `this.${a.name} = value`).call(el, a.value);
                } else {
                    el.setAttribute(a.name, a.value);
                }
            }


        }

        if (json.children) {

            for (var c = 0; c < json.children.length; c++) {

                el.isOption = json.tag == 'option';

                OrnParser.Output(json.children[c], el);
            }

        }

        if (json.position !== null && typeof json.position != 'undefined') {

            parent.insertBefore(el, parent.childNodes[json.position]);

        } else {

            parent.appendChild(el);

        }

        return el;
    }

    Parse(ex) {

        var r = ex;

        const param = this.Args();

        try {
            r = new Function(param.arg, 'return ' + ex).apply(this.scope[0], param.val);
        } catch (e) {
            r = null;
            Orn.debug && console.log(`DYM-ERROR: Expression "${ex}" not found in scope`, this.scope);
        }

        return r;

    }

    Args() {

        const output = {
            arg: [],
            val: []
        };

        for (let j in this.scope) {
            for (let k in this.scope[j]) {
                output.arg.push(k);
                output.val.push(this.scope[j][k]);
            }
        }

        output.arg.push('event');
        output.arg.push('element');
        output.val.push(false);
        output.val.push(false);

        return output;

    }

    Repeat() {

        let dummy = this.attribute.value.split(' as ');

        let collection = this.Parse(dummy[0].replace(/ \n\t\r/gi, ''));

        if (!collection) {
            return;
        }

        dummy = dummy[1].replace(/ \n\t\r/gi, '').split(':');

        const _k = dummy[0];

        const _v = dummy[1];

        var index = 0;

        if (!this.parent) {
            console.log('orn-repeat must be in a container', this.attribute.value);
        }

        this.parent.children[this.index] = false;

        for (let ci in collection) {

            if (!collection.hasOwnProperty(ci)) {
                return;
            }

            var template = OrnParser.Clone(this.node);

            template.attributes.splice(this.attribute.index, 1);

            let local = {};

            local[_k] = isNaN(ci) ? ci : ci * 1;

            local[_v] = collection[ci];

            let scope = [...this.scope, local];

            let node = OrnParser.Process(template, this.parent, 0, scope);

            node.position = this.index * 1 + (index++);

            this.parent.children.push(node);

        }
    }

    Data() {

        let v = this.Parse(this.attribute.value);
        if (typeof(v) === 'object') {
            v = JSON.stringify(v);
        }

        this.node.attributes[this.attribute.index] = {
            name: this.attribute.name.replace('orn-', ''),
            value: v
        };

    }

    OnEvent() {

        const param = this.Args();

        var exp = this.attribute.value;

        var handle;

        if (exp.match(/([a-xA-z]+[a-zA-z0-9_]*)\((.*?)\)/gi)) {
            try {

                let itentifier = exp.replace(/\((.*?)\)/gi, '');

                handle = new Function(param.arg,
                    `
                            try{ 
                                return typeof this.${itentifier}!='undefined' ? this.${exp} : ${exp}
                            }catch(e){
                                try{
                                    return ${exp};
                                }catch(e){
                                    
                                }
                            }
                    `);

            } catch (e) {
                Orn.debug && console.log(`DYM-ERROR: orn-on expression "${exp}" not found in provided scope:`, this.scope);
                return;
            }
        } else {

            handle = new Function(param.arg, 'return ' + exp.replace(/\n/g, ''));

        }

        this.node.attributes[this.attribute.index] = {
            name: this.attribute.name.replace('orn-', ''),
            value: (function(handler, vals, t) {
                return function(event, element) {
                    vals[vals.length - 2] = event;
                    vals[vals.length - 1] = element;
                    handler.apply(t.scope[0], vals);
                };
            })(handle, param.val, this)
        };

    }

    Show() {

        this.node.attributes[this.attribute.index] = {
            name: 'show',
            value: (function(scope, exp) {

                return function(o) {

                    var val = false;

                    try {
                        val = new Function(['o'], 'return o.' + exp + '')(scope.scope[0]);
                    } catch (e) {
                        val = scope.Parse(exp);
                    }

                    if (val) {
                        o.style.removeProperty('display');
                    } else {
                        o.style.display = 'none';
                    }

                };

            })(this, this.attribute.value)
        };

    }

    InputModel() {

        var type = this.node.attributes.find((el) => el.name === 'type');

        this.node.attributes[this.attribute.index] = {
            name: 'model',
            value: (function(scope, model) {

                var value = scope.Parse(model);

                return function(o) {

                    switch (true) {

                        case type && (type.value == 'checkbox' || type.value == 'radio'):

                            if (value instanceof Array) {
                                var f = value.indexOf(o.value) === -1;
                                if (o.checked) {
                                    f && value.push(o.value);
                                } else {
                                    !f && value.splice(value.indexOf(o.value), 1);
                                }
                            } else {
                                if (o.checked) {
                                    value = o.value;
                                } else if (o.type !== 'radio') {
                                    value = '';
                                }
                            }

                            break;

                        case scope.node.tag === 'SELECT':

                            if (o.multiple) {
                                value = [];
                                for (var i = 0; i < o.options.length; i++) {
                                    var opt = o.options[i];
                                    if (opt.selected) {
                                        value.push(opt.value || opt.text);
                                    }
                                }
                            } else {
                                value = o.value;
                            }

                            break;

                        default:

                            if (value instanceof Array) {
                                value.indexOf(o.value) === -1 && value.push(o.value);
                            } else {
                                value = o.value;
                            }

                            break;

                    }

                    let parser = new OrnParser(false, false, false, false, [...scope.scope, {
                        _inputvalue: value
                    }]);

                    parser.Parse(`${model}=_inputvalue`);


                };

            })(this, this.attribute.value)
        };

    }

    InputState() {

        var __v = this.Parse(this.attribute.value);
        if (!__v) {} else {
            this.node.attributes[this.attribute.index] = {
                name: this.attribute.name.replace('orn-', ''),
                value: true
            };
        }
    }

    CSSClass() {

        var attr = this.node.attributes.find((el) => el.name === 'class');

        if (!attr) {

            attr = {
                name: 'class',
                value: ''
            };

            this.node.attributes.push(attr);
        }

        var __v = this.Parse(this.attribute.value);

        delete this.attribute.value;

        if (typeof(__v) === 'string') {
            attr.value += ' ' + __v;
        } else if (typeof(__v) === 'object') {
            for (let __x in __v) {
                if (__v[__x]) {
                    attr.value += ' ' + __x;
                }
            }
        } else if (typeof(__v) === 'function') {
            attr.value += ' ' + __v(this.scope);
        }
    }

    CSSStyle() {

        var attr = this.node.attributes.find((el) => el.name === 'style');

        if (!attr) {

            attr = {
                name: 'style',
                value: ''
            }

            this.node.attributes.push(attr);
        }

        var __v = this.Parse(this.attribute.value);

        delete this.attribute.value;

        if (typeof(__v) === 'string') {
            attr.value += ';' + __v;
        } else if (typeof(__v) === 'object') {
            for (let __x in __v) {
                if (__v[__x]) {
                    attr.value += ';' + __x;
                }
            }
        }

    }

    Condition() {

        var __v = this.Parse(this.attribute.value);
        delete this.attribute.value;
        if (!__v) {
            this.node.tag = false;
            this.node.children = [];
            if (this.parent) {
                this.parent.children[this.index] = false;
            }
            return false;
        }
        return true;

    }

    Attribute() {

        if (this.node.tag === 'TEXTAREA' && this.attribute.name === 'orn-value') {
            this.node.html = this.Parse(this.attribute.value);
        } else {
            let val = this.Parse(this.attribute.value);
            this.node.attributes[this.attribute.index] = {
                name: this.attribute.name.replace('orn-', ''),
                value: val ? val : ''
            };
        }

    }

}

/**
 * Lazy Load a javascript or css
 * @param  {String} resouce resouce path or array of resouce path
 * 
 */

const LazyLoad = async function(resource) {

    if (!LazyLoad.queue) {
        LazyLoad.queue = {};
    }

    if (typeof resource != 'string') {
        for (var i = 0; i < resource.length; i++) {
            await LazyLoad(resource[i]);
        }
        return;
    }

    var src = resource;

    if (src.match(/\.css/)) {

        if (!document.querySelector('link[href="' + src + '"]')) {
            const css = document.createElement('link');
            css.type = "text/css";
            css.rel = "stylesheet";
            css.href = src;
            new OrnCollection('head').append(css);
        }

        return;
    }

    var srctag = document.querySelector('script[src="' + src + '"]');

    if (srctag) {
        await new Promise((resolve, reject) => {
            SleepUntil(function() {
                var Loaded = typeof LazyLoad.queue[src] == 'undefined';
                if (!Loaded) {
                    if (LazyLoad.queue[src] == 'ERROR') {
                        reject();
                        srctag.parentNode.removeChild(srctag);
                        return true;
                    }
                    return false;
                }
                resolve();
                return true;
            });
        });
        return;
    }

    await new Promise((resolve, reject) => {
        LazyLoad.queue[src] = true;
        const script = document.createElement('script');
        script.onload = function() {
            delete LazyLoad.queue[src];
            resolve();
        };
        script.onerror = function() {
            LazyLoad.queue[src] = 'ERROR';
            reject();
        };
        script.async = true;
        document.body.appendChild(script);
        script.src = src;
    });

};

const SleepUntil = function(c) {
    if (c()) {
        return;
    }
    setTimeout(function() {
        SleepUntil(c);
    });
};

(() => {

    Orn.debug = false;

    OrnTemplate.cache = {};

    setInterval(function() {

        let show = document.querySelectorAll('*[orn-show=""]');

        if (show) {
            for (let i = 0; i < show.length; i++) {
                if (show[i].show) {
                    show[i].show();
                }
            }
        }

    }, 50);

})();

/*
 * Orn.js beta v2.0.0 Sep 4 2020 * 
 * First draft of beta version on July 27, 2020. Please report any bug at github.com/cosmos-lab
 * Constant contributors github.com/cosmos-lab & github.com/fraggys
 *
 */