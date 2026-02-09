cd /www/wwwroot/blog.rezedge.com/source/_posts

BRANCH=master

LOCAL=$(git log $BRANCH -n 1 --pretty=format:"%H")
REMOTE=$(git log remotes/origin/$BRANCH -n 1 --pretty=format:"%H")

echo "Local: $LOCAL"
echo "Remote: $REMOTE"

git fetch --all
git reset --hard origin/master 
git pull
echo "Update finished"

echo "Start generate"
cd /www/wwwroot/blog.rezedge.com/
pnpm hexo generate
rm -r ./index/
mv ./public/ ./index/