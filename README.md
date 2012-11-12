ScrollStream
============

A jQuery plugin for making UI-correct, infinite scroll grids with fixed footprints.

Author
------

John J. Workman ([workmajj](https://github.com/workmajj)) for PhotoShelter, Inc.

Description
-----------

Displaying long lists of items (e.g., photos) is a front-end problem with a couple common solutions. Simple pagination is the most basic: a set number of items are shown per page, which keeps the DOM fixed and the scroll bar position stable. Another technique, "infinite scroll," involves appending items to the page as you scroll downward. This requires less clicking but makes the scroll bar unstable. In addition, the browser can become less responsive as more and more items are added.

ScrollStream is a jQuery plugin that combines these methods, rendering lists on one page using a fixed number of DOM elements and a naturally positioned scroll bar. The first is done by dynamically adding new items and removing old ones as you scroll up or down. This means the number of elements is conserved, making it easy to browse millions of items with no performance hit. The second happens by varying the items' vertical positioning so that the scroll bar responds correctly, letting you jump to any point.

We're using ScrollStream in production and it's holding up well, though there are a few improvements we'd still like to make:

* Make it easier to use with dynamic data (that is, allow individual items to be updated rather than just blocks).

* Have the plugin determine item sizes automatically.

* Scroll to an arbitrary line upon load, to make navigation between pages better.

Note that ScrollStream doesn't remember any data; it's up to you to fulfill requests economically. We use a front-end cache for this.

Usage
-----

**(Check out the demo for a simple working example.)**

1. Create one or more CSS classes that'll be used to style your items. Make sure to `float` them.

2. Make a new ScrollStream object on an empty `div`, setting any options (a full list is below):

    ```javascript
    var $div = $('#foo'); // suppose your div has an id foo
    
    var scroll = $div.scrollStream({
        context: function() {
            return $someScrollable;
        },
        loading: function() {
            var src = '/path/to/busy-spinner.gif';
            return '<div class="busy"><img src="' + src + '" /></div>';
        },
        classes: {
            ol: 'bar baz qux',
            li: 'someItemClass' // this is the CSS class you created above
        }
    }).data('scrollStream');
    ```

3. Handle the plugin's requests for paged data by binding to the `div`:

    ```javascript
    $div.on('req.scrollstream', function(event, data) {
        someFetchFunction(data.start, data.size);
    });
    ```

4. You can return data immediately, or respond via event when any async work is done:

    ```javascript
    function someFetchFunction(start, size) {
        // generate an array of items' HTML contents
        
        // optionally, make an array of key-value pairs to add with $.data()
        // and/or an array of CSS classes that will be added to each item
        
        $div.trigger('resp.scrollstream', {
            start: someOffsetNumber,
            liHtml: someArrayOfHtmlContents,
            // liData: someArrayOfDataObjects,
            // liClass: someArrayOfClassStrings
        });
    }
    ```

5. Finally, initialize the plugin and supply it with info about your items:

    ```javascript
    scroll.init({
        buffer: someBufferNumber,
        item: {
            count: someHugeNumberOfItems,
            height: someHeight,
            width: someWidth
        }
    });
    ```

6. Now load your page and scroll!

Following just these steps should work in most cases. For complicated apps, however, you can also customize event names, bind to stop/start events to trigger external actions, and reset or destroy the plugin using externally available methods. These last features are helpful when you need to reinitialize the plugin with new data (when reusing it in a common view, for example).

You can also use ScrollStream to render vertical lists: just think of them as grids with one item per row.

Configuration
-------------

Optional parameters the plugin accepts when it's instantiated:

| **Option**        | **Description**                                                                | **Default Value**      |
|:------------------|:-------------------------------------------------------------------------------|:-----------------------|
| `name`            | Prefix used on IDs of DOM elements the plugin creates.                         | `'scrollstream'`       |
| `context`         | Function returning a jQuery object to which `scroll` listener will be bound.   | `window`               |
| `debug`           | Print rendering changes applied on each `scroll` event.                        | `false`                |
| `events.req`      | Event via which ScrollStream passes data requests.                             | `'req.scrollstream'`   |
| `events.resp`     | Event via which your app passes back responses.                                | `'resp.scrollstream'`  |
| `events.start`    | Event triggered when ScrollStream begins mutating the DOM.                     | `'start.scrollstream'` |
| `events.stop`     | Event triggered when the DOM has stabilized again.                             | `'stop.scrollstream'`  |
| `timers.debounce` | Interval (ms) at which ScrollStream sends requests for new data.               | `500`                  |
| `timers.feedback` | Interval (ms) at which scrolling is polled.                                    | `200`                  |
| `timers.queue`    | Interval (ms) at which responses are matched with requests.                    | `100`                  |
| `loading`         | Function that returns placeholder HTML for loading items (e.g., busy spinner). | `null`                 |
| `classes.ol`      | String of CSS classes to add to the grid container.                            | `null`                 |
| `classes.li`      | String of CSS classes to add to individual items.                              | `null`                 |

Parameters that `init` requires (all are of type `number`):

| **Parameter** | **Description**                                                                       |
| :-------------|:--------------------------------------------------------------------------------------|
| `buffer`      | Rows to add before and after the viewable area.                                       |
| `item.count`  | Total count of items to be rendered.                                                  |
| `item.height` | Height of a single item after CSS is applied (including padding, border, and margin). |
| `item.width`  | Width of a single item after CSS is applied (including padding, border, and margin).  |

Other external methods:

| **Method**       | **Description**                                                            | **Return Type** |
|:-----------------|:---------------------------------------------------------------------------|:----------------|
| `getHeight`      | Height in pixels of the entire grid (includes all rows, viewable or not).  | `number`        |
| `getItemsPerRow` | Number of items rendered per row.                                          | `number`        |
| `resize`         | Recalculate constants. Can be bound to viewport resize event if needed.    | `undefined`     |
| `reset`          | Reset state. Useful for repopulating with new data by then calling `init`. | `undefined`     |
| `destroy`        | Reset plugin and then revert the DOM to its initial state.                 | `undefined`     |

How It Works
------------

Here's an ASCII art view of what's going on:

    +------------------+ <------+ <-----------+
    | div pushing      |        |             |
    | everything down  |        |             |
    | (height changes  |        +------pre    |
    | dynamically)     |        |    (empty)  |
    +------------------+ <------+             |
    | (buffer rows)    |        |             |
    |                  |        |             |
    +------------------+        |             |
    | viewport/div     |        +------block  |
    | (what you see)   |        |     (items) |
    |                  |        |             |
    |                  |        |             |
    +------------------+        |             |
    | (buffer rows)    |        |             |
    |                  |        |             |
    +------------------+ <------+             |
    | extra space at   |                      |
    | container bottom |                      |
    | (height constant |                      +------container
    | and depends on   |                      |       (empty)
    | how many items)  |                      |
    |                  |                      |
    |                  |                      |
    |                  |                      |
    +------------------+ <--------------------+

The container is as tall as all the rows if they had been drawn; this is what's used to make the scroll bar the correct height. As you scroll, items are added to and removed from the block, and a function called `_calcPre` determines how much to push it down. Centering the block in the viewport means there are rows available before and after to act as buffers. Old content is removed and placeholders are added immediately, but new content is only requested once an interval (`timers.debounce`) has passed.

[License](http://en.wikipedia.org/wiki/Apache_License)
-------

Copyright 2012 PhotoShelter, Inc.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
