/*******************************************************************************

scrollstream.jquery.js (v1.0.1)
https://github.com/photoshelter/scrollstream

Copyright 2012 PhotoShelter, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*******************************************************************************/

;(function($, window, undefined) {

var ScrollStream = function(elem, opts) {
    var defaults = {
        name: 'scrollstream',
        context: null, // element to scroll (defaults to window)
        debug: false,
        events: {
            req: 'req.scrollstream',
            resp: 'resp.scrollstream',
            start: 'start.scrollstream',
            stop: 'stop.scrollstream'
        },
        timers: {
            debounce: 500,
            feedback: 200,
            queue: 100
        },
        loading: null,
        classes: {
            ol: null,
            li: null
        }
    };

    // initialize settings and state
    this.opts = $.extend({}, defaults, opts);
    this.jq = {};
    this.consts = {};
    this.intervals = {};
    this.reqQ = [];
    this.respQ = [];

    this.jq.$elem = $(elem);

    // set up html and cache jq selectors
    this.jq.$elem.html(this._makeHtml());
    $.extend(this.jq, this._makeJq());

    this.jq.$context.css('overflow-y', 'scroll');
};

ScrollStream.prototype = {
    opts: null,
    jq: null,
    consts: null,
    intervals: null,
    reqQ: null,
    respQ: null,

    /* set up html and cache jq selectors */

    _makeHtml: function() {
        var pre = this.opts.name + '-pre';
        var block = this.opts.name + '-block';

        var html = '<div id="' + pre + '"></div>';
        var c = this.opts.classes.ol;
        html += c ? '<ol id="' + block + '" class="' + c + '"></ol>' :
            '<ol id="' + block + '"></ol>';

        return html;
    },

    _makeJq: function() {
        return {
            $context: (typeof this.opts.context === 'function') ?
                this.opts.context() : $(window),
            $pre: $('#' + this.opts.name + '-pre'),
            $block: $('#' + this.opts.name + '-block')
        };
    },

    /* init, queues, event handling, and intervals */

    preRows: null,
    scrolled: null,
    resized: null,

    init: function(initOpts) {
        this.opts.buffer = initOpts.buffer;
        this.opts.item = initOpts.item;

        // check types to skip parseInt later
        if (typeof this.opts.buffer !== 'number' ||
            typeof this.opts.item.count !== 'number' ||
            typeof this.opts.item.height !== 'number' ||
            typeof this.opts.item.width !== 'number') {
                throw new TypeError("Malformed ScrollStream init type");
        }

        // clear old content and return if no items
        if (this.opts.item.count < 1) {
            this.jq.$block.html('');
            return;
        }

        // minimum to show partial top and bottom rows
        if (this.opts.buffer < 2) this.opts.buffer = 2;

        // calculate and apply constants
        this.consts = this._calcConsts();
        this.jq.$elem.height(this.consts.contRows *
            this.opts.item.height);
        this.jq.$block.height(this.consts.blockRows *
            this.opts.item.height);

        if (this.opts.debug) {
            console.log("[init]");
            console.log("itemsPerRow:   " + this.consts.itemsPerRow);
            console.log("contRows:      " + this.consts.contRows);
            console.log("blockRows:     " + this.consts.blockRows);
            console.log("itemsPerBlock: " + this.consts.itemsPerBlock);
            console.log("----------------------------------------");
        }

        this._startQueues();
        this._wireRespEvent();

        // initial items
        this.jq.$context.scrollTop(0);
        this.jq.$pre.height(0);
        this.preRows = 0;
        this._handleScroll('reload', 0, this.consts.itemsPerBlock, null, false);

        this.scrolled = false;
        this.resized = false;

        // main scroll feedback loop
        var that = this;
        this.jq.$context.scroll(function() { that.scrolled = true; });
        this.intervals.feedback = window.setInterval(function() {
            return that._feedback.apply(that);
        }, this.opts.timers.feedback);
    },

    _calcConsts: function() {
        var i = this.opts.item;

        var itemsPerRow = Math.floor(this.jq.$block.width() / i.width);
        if (itemsPerRow < 1) itemsPerRow = 1;
        var contRows = Math.ceil(i.count / itemsPerRow);

        var winRows = Math.ceil(this.jq.$context.height() / i.height);
        var blockRows;
        if (winRows < 1) blockRows = 1 + (2 * this.opts.buffer);
        else blockRows = winRows + (2 * this.opts.buffer);
        if (blockRows > contRows) blockRows = contRows;

        var itemsPerBlock = blockRows * itemsPerRow;
        if (i.count < itemsPerBlock) itemsPerBlock = i.count;

        return {
            itemsPerRow: itemsPerRow,
            contRows: contRows,
            blockRows: blockRows,
            itemsPerBlock: itemsPerBlock
        };
    },

    _startQueues: function() {
        var that = this;
        this.intervals.queue = window.setInterval(function() {
            while (that.reqQ.length > 0 && that.respQ.length > 0) {
                var req = that.reqQ[0];

                var matched = false;

                // async means cannot guarantee respQ[0] is response for reqQ[0]
                for (var i = 0; i < that.respQ.length; i++) {
                    var resp = that.respQ[i];

                    if (req.start === resp.start &&
                        req.size === resp.liHtml.length) { // req/resp pair
                            that.reqQ.shift();
                            that.respQ.splice(i, 1);
                            that._handleResp(req, resp);

                            matched = true;
                            break; // short-circuit, so loop usually O(1)
                    }
                }

                if (!matched) break; // end if current req[0] has no resp yet
            }
        }, this.opts.timers.queue);
    },

    _wireRespEvent: function() {
        var that = this;
        this.jq.$elem.on(this.opts.events.resp, function(e, d) {
            if (typeof d.start !== 'number' ||
                !d.liHtml || !(d.liHtml instanceof Array) ||
                (d.liData && typeof d.liData !== 'object')) {
                    throw new TypeError("Malformed ScrollStream response type");
            }

            that.respQ.push(d);
        });
    },

    /* main scroll feedback loop */

    _feedback: function() {
        if (!this.resized && !this.scrolled) return;

        var newPreRows = this._calcPre(Math.floor(this.jq.$context.scrollTop() /
            this.opts.item.height));

        // proceed only if resized or at least one row scrolled
        if (!this.resized && newPreRows === this.preRows) {
            this.scrolled = false;
            return;
        }

        this.jq.$pre.height(newPreRows * this.opts.item.height);

        var type, start, size, remove;

        var rowDelta = newPreRows - this.preRows;
        if (!this.resized && Math.abs(rowDelta) < this.consts.blockRows) {
            var remain = (this.opts.item.count % this.consts.itemsPerRow) !== 0;

            if (rowDelta < 0) {
                type = 'up'; // add elems to top and remove from bottom

                start = newPreRows * this.consts.itemsPerRow;
                size = -rowDelta * this.consts.itemsPerRow;

                // handle potentially partial last row
                if ((this.preRows === this.consts.contRows -
                    this.consts.blockRows) && remain) {
                        remove = size - this.consts.itemsPerRow +
                            (this.opts.item.count % this.consts.itemsPerRow);
                }
                else {
                    remove = size;
                }
            }
            else {
                type = 'down'; // add elems to bottom and remove from top

                start = this.consts.itemsPerRow *
                    (this.preRows + this.consts.blockRows);
                remove = rowDelta * this.consts.itemsPerRow;

                // handle potentially partial last row
                if ((newPreRows === this.consts.contRows -
                    this.consts.blockRows) && remain) {
                        size = remove - this.consts.itemsPerRow +
                            (this.opts.item.count % this.consts.itemsPerRow);
                }
                else {
                    size = remove;
                }
            }
        }
        else {
            type = 'reload'; // resized or scrolled enough to need new block

            start = newPreRows * this.consts.itemsPerRow;
            remove = null; // full reload

            // handle potentially partial last row
            if (start + this.consts.itemsPerBlock <= this.opts.item.count) {
                size = this.consts.itemsPerBlock;
            }
            else {
                size = this.consts.itemsPerBlock - this.consts.itemsPerRow +
                    (this.opts.item.count % this.consts.itemsPerRow);
            }
        }

        this._handleScroll(type, start, size, remove, true);

        this.preRows = newPreRows;

        this.scrolled = false;
        this.resized = false;
    },

    _calcPre: function(scrolledRows) {
        if (this.opts.item.count <= this.consts.itemsPerBlock) return 0;

        if (scrolledRows < this.opts.buffer) return 0;
        else if (scrolledRows <
            this.consts.contRows - this.consts.blockRows + this.opts.buffer)
                return scrolledRows - this.opts.buffer;
        else return this.consts.contRows - this.consts.blockRows;
    },

    /* scroll request debouncing */

    debounceTimer: null,

    _handleScroll: function(type, start, size, remove, debounce) {
        this._modifyBlock({
            type: type,
            start: start,
            size: size,
            remove: remove
        });

        // skip timeout on initial load
        if (!debounce) {
            this._fillPlaceholders();
            return;
        }

        // fill placeholders only once scrolling has stopped
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        var that = this;
        this.debounceTimer = window.setTimeout(function() {
            return that._fillPlaceholders.apply(that);
        }, this.opts.timers.debounce);
    },

    _fillPlaceholders: function() {
        var offset;
        var placeholders = [];

        // build up array of empty placeholders
        var that = this;
        this.jq.$block.children().each(function(i) {
            if (i === 0) {
                offset = parseInt($(this).attr('id')
                    .split(that.opts.name + '-id-')[1], 10);
            }
            placeholders.push($(this.firstChild)
                .hasClass(that.opts.name + '-loading'));
        });

        // load runs of placeholders
        var runs = this._findRuns(placeholders);
        for (var i = 0; i < runs.length; i++) {
            if (runs[i].value !== true) continue;

            var d = {
                start: offset + runs[i].start,
                size: runs[i].count
            };

            this.reqQ.push(d);
            this.jq.$elem.trigger(this.opts.events.req, d);
        }
    },

    _findRuns: function(a) {
        var segments = [];

        var start, count, last;
        for (var i = 0; i < a.length; i++) {
            if (i === 0) {
                start = 0;
                count = 1;
                last = a[i];
            }
            else if (a[i] === last) {
                count++;
            }
            else {
                segments.push({
                    start: start,
                    count: count,
                    value: last
                });
                start = i;
                count = 1;
                last = a[i];
            }

            if (i === a.length - 1) {
                segments.push({
                    start: start,
                    count: count,
                    value: last
                });
            }
        }

        return segments;
    },

    /* drawing placeholders and response content */

    _modifyBlock: function(req) {
        var e = this.opts.events.start;
        if (e) this.jq.$elem.trigger(e);

        // loading placeholder (plain html)
        var marker = '<div class="' + this.opts.name + '-loading"></div>';
        var loading = (typeof this.opts.loading === 'function') ?
            this.opts.loading() : '';

        var html = '';
        for (var i = 0; i < req.size; i++) {
            var id = this.opts.name + '-id-' + (req.start + i);

            var c = this.opts.classes.li;
            var li = c ? '<li id="' + id + '" class="' + c + '">' :
                '<li id="' + id + '">';
            li += marker + loading + '</li>';

            html += li;
        }

        if (this.opts.debug) {
            console.log("[" + req.type + "]");
            console.log("start+size:    " + req.start + "+" + req.size);
            console.log("remove:        " + req.remove);
            console.log("----------------------------------------");
        }

        switch (req.type) {
        case 'down':
            this.jq.$block.append(html)
                .children().slice(0, req.remove).remove();
            break;
        case 'up':
            this.jq.$block.prepend(html)
                .children().slice(-req.remove).remove();
            break;
        case 'reload':
            this.jq.$block.html(html);
            break;
        }
    },

    _handleResp: function(req, resp) {
        var startId = this.opts.name + '-id-' + req.start;
        var untilId = this.opts.name + '-id-' + (req.start + req.size);

        var $start = $('#' + startId);
        var $elems = $start.add($start.nextUntil('#' + untilId));

        // replace each placeholder
        $elems.each(function(i) {
            var $this = $(this).html(resp.liHtml[i]);

            // add optional data key-value pairs
            if (resp.liData && typeof resp.liData[i] === 'object') {
                for (var k in resp.liData[i]) {
                    if (resp.liData[i].hasOwnProperty(k)) {
                        $this.data(k, resp.liData[i][k]);
                    }
                }
            }

            // add optional string of classes
            if (resp.liClass && typeof resp.liClass[i] === 'string') {
                $this.addClass(resp.liClass[i]);
            }
        });

        var e = this.opts.events.stop;
        if (e) this.jq.$elem.trigger(e);
    },

    /* other external methods */

    getHeight: function() {
        return this.consts.contRows * this.opts.item.height;
    },

    getItemsPerRow: function() {
        return this.consts.itemsPerRow;
    },

    resize: function() {
        if (!this.opts.item) return; // ignore if not init-ed

        var newConsts = this._calcConsts();

        // return if neither quantized amount changed
        if (newConsts.itemsPerRow === this.consts.itemsPerRow &&
            newConsts.blockRows === this.consts.blockRows) return;

        this.reqQ = [];
        this.respQ = [];

        this.consts = newConsts;
        this.jq.$elem.height(this.consts.contRows *
            this.opts.item.height);
        this.jq.$block.height(this.consts.blockRows *
            this.opts.item.height);

        this.resized = true; // flag picked up by feedback interval
    },

    reset: function() {
        this.jq.$elem.off();

        clearInterval(this.intervals.feedback);
        clearInterval(this.intervals.queue);

        this.consts = {};
        this.intervals = {};
        this.reqQ = [];
        this.respQ = [];

        this.preRows = null;
        this.scrolled = null;
        this.resized = null;

        delete this.opts.items;
        delete this.opts.buffer;

        this.jq.$block.html('');
    },

    destroy: function() {
        this.reset();

        var html = '<div id="' + this.opts.name + '"></div>';
        this.jq.$elem.replaceWith(html);
    }
};

$.fn.scrollStream = function(opts) {
    return this.each(function() {
        if (!$.data(this, 'scrollStream')) {
            $.data(this, 'scrollStream', new ScrollStream(this, opts));
        }
    });
};

})(jQuery, window);
