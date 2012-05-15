$(function() {

////////////////////////////////////////////////////////////////////////////////

var memo = [];
var getContent = function(start, size) {
    var a = [];
    
    for (var i = start; i < start + size; i++) {
        if (typeof memo[i] !== 'undefined') {
            a.push(memo[i]);
            continue;
        }
        
        var dims = 1 + Math.floor(Math.random() * 90);
        var padL = Math.floor((90 - dims) / 2);
        var padR = Math.ceil((90 - dims) / 2);
        
        var url = 'http:\/\/placehold.it/' + dims + 'x' + dims;
        // var url = 'http:\/\/placekitten.com/' + dims + '/' + dims;
        
        var $img = $('<img title="#' + (i + 1) + '" src="' + url + '"/>').css({
            'padding-top': padL + 'px',
            'padding-left': padL + 'px',
            'padding-bottom': padR + 'px',
            'padding-right': padR + 'px',
        }).add('<p>' + (i + 1) + '</p>');
        
        memo[i] = $img;
        a.push($img);
    }
    
    return a;
};

////////////////////////////////////////////////////////////////////////////////

// cache selector and bind request event
var $demo = $('#demo').on('req.scrollstream', function(e, data) {
    $(this).trigger('resp.scrollstream', {
        start: data.start,
        liHtml: getContent(data.start, data.size)
    });
});

// instantiate
var ss = $demo.scrollStream({
    // debug: true,
    loading: function() {
        return '<img style="margin:37px" src="busy.gif" />';
    },
    classes: {
        ol: null,
        li: 'item'
    }
}).data('scrollStream');

// initialize
ss.init({
    buffer: 8,
    item: {
        count: 10000,
        // count: 100000,
        // count: 1000000,
        height: 100,
        width: 100
    }
});

////////////////////////////////////////////////////////////////////////////////

});
