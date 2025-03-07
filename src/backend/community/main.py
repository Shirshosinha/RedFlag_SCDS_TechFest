from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import snowflake.connector
from pydantic import BaseModel
from decimal import Decimal
import random

conn = snowflake.connector.connect(
    user="raghavg332",
    password= PASSWORD,
    account=ACCOUNT,
    warehouse="COMPUTE_WH",
    database="COMMUNITYNOTESDB",
    schema="PUBLIC"
    )
cur = conn.cursor()
app = FastAPI()
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#mke endpoint for adding a comment from the frontend (comment_id, website_url, comment_text, source_link, timestamp)

# Define a Pydantic model for request body
class CommentRequest(BaseModel):
    comment_id: int | None = None  # Optional, will generate if missing
    website_url: str
    comment_text: str
    source_link: str | None = None  # Optional, defaults to NULL

@app.post("/add_comment")
async def add_comment(comment: CommentRequest):
    try:
        # Generate a random comment_id if not provided
        if comment.comment_id is None:
            comment.comment_id = random.randint(1000, 999999)
        
        # Handle empty source_link
        source_link = comment.source_link if comment.source_link else "NULL"
        cur.execute(f"""
            INSERT INTO comments (comment_id, website_url, comment_text, source_link, timestamp)
            VALUES ({comment.comment_id}, '{comment.website_url}', '{comment.comment_text}', '{source_link}', CURRENT_TIMESTAMP);
        """)

        conn.commit()
        return JSONResponse(content={"message": "Comment added successfully!"})
    
    except Exception as e:
        conn.rollback()
        return JSONResponse(content={"error": str(e)}, status_code=500)

#get comments from the database for a website_url provided by the frontend
@app.get("/get_comments")
async def get_comments(website_url: str = Query(..., title="Website URL")):
    # Secure parameterized query
    cur.execute(f"SELECT comment_text,source_link FROM comments WHERE website_url = '{website_url}';")
    comments = cur.fetchall()
    # Extracting comment text and source link
    comment_data = [
        {
            "comment_text": row[0],
            "source_link": row[1] if row[1] else None  # Handle NULL values
        }
        for row in comments
    ]
    
    return JSONResponse(content={"comments": comment_data})

@app.get("/get_comment_stats")
async def get_comment_stats(website_url: str = Query(..., title="Website URL")):
    try:
        cur.execute(f"SELECT COUNT(*) FROM comments WHERE website_url = '{website_url}'")
        comment_count = cur.fetchone()[0]

        if comment_count == 0:
            return JSONResponse(content={
                "sentiment_stats": [],
                "comment_summary": "No comments available for this page."
            })
        # ✅ Sentiment Analysis for a Specific URL
        cur.execute(f'''WITH sentiment_analysis AS (
            SELECT 
                comment_text,
                SNOWFLAKE.CORTEX.CLASSIFY_TEXT(
                    comment_text, 
                    ['positive', 'negative', 'neutral'],
                    {{
                        'task_description': 'Determine the overall sentiment of the given comment as positive, negative, or neutral.'
                    }}
                )['label'] AS sentiment
            FROM comments
            WHERE website_url = '{website_url}'
        )
        SELECT 
            sentiment,
            COUNT(*) AS count,
            COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS percentage
        FROM sentiment_analysis
        GROUP BY sentiment;''')

        sentiment_results = cur.fetchall()  # Fetch sentiment analysis results

        # ✅ Summarization for a Specific URL
        cur.execute(f'''SELECT SNOWFLAKE.CORTEX.COMPLETE(
            'mistral-large',
            CONCAT('Summarize the following user comments to provide users a small overview of what others think: ', 
                LISTAGG(comment_text, ' ') WITHIN GROUP (ORDER BY comment_text)
            )
        ) AS comment_summary
        FROM comments
        WHERE website_url = '{website_url}';''')

        summary_result = cur.fetchone()  # Fetch summary (single result expected)

        # ✅ Convert Decimal to float for JSON serialization
        sentiment_data = [
            {
                "sentiment": row[0],
                "percentage": float(row[2])  # Convert Decimal to float
            }
            for row in sentiment_results
        ]

        summary_text = summary_result[0] if summary_result else "No comments available for summarization."
        print(summary_text)
        # ✅ Return JSON response
        return JSONResponse(content={
            "sentiment_stats": sentiment_data,
            "comment_summary": summary_text
        })

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)