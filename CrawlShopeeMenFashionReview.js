

const puppeteer = require('puppeteer');
var elasticsearch = require('elasticsearch');
const fs = require('fs');
var client = new elasticsearch.Client({ host: 'localhost:9200', log: 'trace' });
//hàm check kết nối tới elasticsearch
function TestConnect() {
    client.ping({
        // ping usually has a 3000ms timeout
        requestTimeout: 1000
    }, function (error) {
            if (error) {
                console.trace('elasticsearch cluster is down!');
            }
            else {
                console.log('All is well');
            }
        });
}
TestConnect();

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    const linkConst = 'https://shopee.vn/luongkimhoa2901?categoryId=78&itemId=3122150152'
    await page.goto(linkConst);
    var countPage = 10;
    var data = [];

    async function GetInfoProduct(urlProduct,index) 
    {
        //biến lưu lại list thông tin sản phẩm với mỗi phần tử là 1 comment
        
        try {
            var productInfo = await page.evaluate(async (urlProduct,index) => {
                //lấy về tiêu đề
                let lstInfoProduct=[];
                let title ='';
                if(document.querySelector('.qaNIZv').textContent!=null)
                {
                    title= document.querySelector('.qaNIZv').textContent;
                }
                //lấy về điểm số chung
                let rating='';
                if(document.querySelector('._3Oj5_n ,._2z6cUg').textContent!=null)
                {
                    rating = document.querySelector('._3Oj5_n ,._2z6cUg').textContent;
                }
                //lấy về giá sản phẩm
                let price='';
                if(document.querySelector('._3n5NQx').textContent!=null)
                {
                    price = document.querySelector('._3n5NQx').textContent;
                }
                //lấy về thông tin sản phẩm
                let description = '';
                if(document.querySelector('._2u0jt9 >span').textContent!=null)
                {
                    description = document.querySelector('._2u0jt9 >span').textContent;
                }
                //nếu sản phẩm có comment
                if (document.querySelector('.shopee-button-solid,.shopee-button-solid--primary ') != null) {
                    //khi trang hiện tại chưa phải trang cuối
                    while (document.querySelector('.shopee-button-solid,.shopee-button-solid--primary ') != document.querySelectorAll('.product-ratings__page-controller >button')[document.querySelectorAll('.product-ratings__page-controller >button').length - 2]) {
                        let queryChildCommentDiv = document.querySelectorAll('.shopee-product-rating__main');

                        Array.prototype.map.call(queryChildCommentDiv, function (t) {
                            let content='';
                            if(t.querySelector('.shopee-product-rating__content').textContent!=null)
                            {
                                content = t.querySelector('.shopee-product-rating__content').textContent;
                            }
                            let querySelectRatting = Array.from(t.querySelectorAll('.icon-rating-solid--active,.icon-rating-solid'));
                            lstInfoProduct.push({Url:urlProduct, Title: title, Rating: rating, Price: price, Description: description, Comment: content,Star:querySelectRatting.length});
                        });
                        //next trang comment tiếp theo
                        await document.querySelector('.shopee-icon-button--right').click();
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                    //lấy comment trang cuối
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    let queryChildCommentDiv = document.querySelectorAll('.shopee-product-rating__main');

                        Array.prototype.map.call(queryChildCommentDiv, function (t) {
                            let content='';
                            if(t.querySelector('.shopee-product-rating__content').textContent!=null)
                            {
                                content = t.querySelector('.shopee-product-rating__content').textContent;
                            }
                            let querySelectRatting = Array.from(t.querySelectorAll('.icon-rating-solid--active,.icon-rating-solid'));
                            lstInfoProduct.push({ Url: urlProduct ,Title: title, Rating: rating, Price: price, Description: description, Comment: content,Star:querySelectRatting.length});
                        });
                        for (let i = lstInfoProduct.length - 1; i >= 0; i--) {
                            if(Object.values(lstInfoProduct[i])[5]==''||Object.values(lstInfoProduct[i])[5]==null)
                            {
                                lstInfoProduct.splice(i,1);
                            }
                        }
                }
                return lstInfoProduct;
            },urlProduct,index);
            return productInfo;
        }
        catch (err) {
            console.log(urlProduct);
            console.log(err);
        }
    }
    async function autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 100;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }
    function CreateIndex() {
        client.indices.exists({
            index: 'index_shopee'
        }).then(function (resp) {
            if (resp == true) {
                console.log('index already exists');
            }
            else {
                client.indices.create({
                    index: 'index_shopee'
                }, function (err, resp, status) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("create", resp);
                    }
                })
            }
        }, function (err) {
            console.trace(err.message);
        });
    }

    async function SaveData(productInfo) {
        try {
            client.index({
                index: 'index_shopee',
                type: 'MenFashion',
                body: {
                    "Url":productInfo.Url,
                    "Title": productInfo.Title,
                    "Rating": productInfo.Rating,
                    "Price": productInfo.Price,
                    "Description": productInfo.Description,
                    "Comment": productInfo.Comment,
                    "Star":productInfo.Star

                }
            }, function (err, resp, status) {
                console.log(resp);
            });
        }
        catch (err) {
            console.log(err);
        }
    }
    var CrawlAllLinkProduct = async () => {
        try {
            if (countPage <= 0) {
                console.log('not found page');
                return;
            }
            await page.waitForSelector('._3hdpJC');
            while (page.$('div .shopee-page-controller .shopee-button-solid--primary')!=page.$$('.shopee-page-controller >button')[page.$$('.shopee-page-controller >button').length-2])
            {
                let count = 0;
                let countPoductInAPage = 0;
                do {
                    await page.waitForSelector('._3hdpJC');
                    let allProductInPage = await page.$$('.col-xs-2-4 ,.shopee-search-item-result__item');
                    countPoductInAPage = allProductInPage.length;
                    await Promise.all([
                        allProductInPage[count].click(),
                        page.waitForNavigation({ waitUntil: 'networkidle0' }),
                    ]);
    
                    await autoScroll(page);
                    const urlProduct = await page.url();
                    let testvalue = await GetInfoProduct(urlProduct,count);
                    if(testvalue!=null)
                    {
                        for (let i = 0; i < testvalue.length; i++) {
                            await SaveData(testvalue[i]);
                        }
                    }
                    await page.goBack();
                    console.log(count);
                    count++;
                }
                while (count < countPoductInAPage)
                await page.click('.shopee-icon-button--right');
            }
        }
        catch (err) {
            console.log(err);
        }
    }
    CreateIndex();
    await CrawlAllLinkProduct(page);
    console.log(data.length);
    //await browser.close();
})();


