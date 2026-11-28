from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from youtube_transcript_api import (
    AgeRestricted,
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
    VideoUnplayable,
    YouTubeTranscriptApi,
)


BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Clipper")


class TranscriptRequest(BaseModel):
    video_id: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")


def format_timestamp(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02}"


@app.get("/", include_in_schema=False)
def serve_frontend() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/script.js", include_in_schema=False)
def serve_script() -> FileResponse:
    return FileResponse(BASE_DIR / "script.js", media_type="text/javascript")


@app.post("/api/transcript")
def get_transcript(request: TranscriptRequest) -> dict:
    try:
        available_transcripts = list(YouTubeTranscriptApi().list(request.video_id))
        if not available_transcripts:
            raise HTTPException(
                status_code=404,
                detail="No captions are available for this YouTube video.",
            )

        selected_transcript = next(
            (
                transcript
                for transcript in available_transcripts
                if transcript.language_code.lower().startswith("en")
            ),
            available_transcripts[0],
        )
        fetched_transcript = selected_transcript.fetch()
    except TranscriptsDisabled as error:
        raise HTTPException(
            status_code=404,
            detail="Captions are disabled for this YouTube video.",
        ) from error
    except NoTranscriptFound as error:
        raise HTTPException(
            status_code=404,
            detail="No captions are available for this YouTube video.",
        ) from error
    except RequestBlocked as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Automatic transcript retrieval is temporarily unavailable because "
                "YouTube is blocking requests from this environment. Try again later "
                "or paste the transcript manually."
            ),
        ) from error
    except AgeRestricted as error:
        raise HTTPException(
            status_code=422,
            detail="Captions cannot be retrieved for this age-restricted video.",
        ) from error
    except (VideoUnavailable, VideoUnplayable) as error:
        raise HTTPException(
            status_code=404,
            detail="This YouTube video is unavailable or cannot be played.",
        ) from error
    except CouldNotRetrieveTranscript as error:
        raise HTTPException(
            status_code=502,
            detail=(
                "YouTube could not provide captions for this video. "
                "The video may be restricted or the caption service may be temporarily unavailable."
            ),
        ) from error

    segments = [
        {
            "start": snippet.start,
            "timestamp": format_timestamp(snippet.start),
            "duration": snippet.duration,
            "text": snippet.text,
        }
        for snippet in fetched_transcript
    ]
    transcript_text = "\n".join(
        f"[{segment['timestamp']}] {segment['text']}" for segment in segments
    )

    return {
        "video_id": request.video_id,
        "language": fetched_transcript.language,
        "language_code": fetched_transcript.language_code,
        "is_generated": fetched_transcript.is_generated,
        "transcript": transcript_text,
        "segments": segments,
    }