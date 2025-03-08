from newspaper import Article

def extract_main_content(url):
    article = Article(url)
    article.download()
    article.parse()
    return article.text  # Returns clean main content

print(extract_main_content("https://x.com/LisaMC619/status/1898459716927262990"))