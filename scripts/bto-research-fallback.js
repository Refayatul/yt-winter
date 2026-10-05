"use strict";
const Discovery=require("./bto-source-discovery");
async function relatedArticles(topic,wikiJson){
  const titles=await Discovery.broadWikipediaTitles(topic,wikiJson),out=[];
  for(const title of titles){
    const data=await wikiJson({action:"query",prop:"extracts",explaintext:1,redirects:1,titles:title});
    const page=data&&data.query&&Object.values(data.query.pages||{})[0];
    if(page&&page.extract&&page.extract.length>500&&!/may refer to/i.test(page.extract.slice(0,300))){out.push({title:page.title,url:`https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,"_"))}`,text:page.extract,discoveryFallback:true});}
    if(out.length>=2)break;
  }
  return out;
}
module.exports={relatedArticles};
