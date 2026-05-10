import { useState } from 'react';

function Timeline({ cards = [], onPlace, interactive }) {
  const [hoveredGap, setHoveredGap] = useState(null);

  function handleGapClick(index) {
    if (!interactive) return;
    onPlace(index);
  }

  // If timeline is empty, show a single placement zone
  if (cards.length === 0 && interactive) {
    return (
      <div className="timeline">
        <div className="timeline-empty">
          <div
            className="timeline-gap active"
            onClick={() => handleGapClick(0)}
          >
            <div className="gap-indicator">Place here</div>
          </div>
        </div>
      </div>
    );
  }

  if (cards.length === 0 && !interactive) {
    return (
      <div className="timeline">
        <div className="timeline-empty">
          <p className="timeline-empty-text">No songs placed yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <div className="timeline-track">
        {/* Gap before first card */}
        {interactive && (
          <div
            className={`timeline-gap ${hoveredGap === 0 ? 'active' : ''}`}
            onMouseEnter={() => setHoveredGap(0)}
            onMouseLeave={() => setHoveredGap(null)}
            onClick={() => handleGapClick(0)}
          >
            <div className="gap-indicator">+</div>
          </div>
        )}

        {cards.map((card, index) => (
          <div key={card.id || index} className="timeline-segment">
            <div className="timeline-card">
              <span className="card-year">{card.year}</span>
              <span className="card-title">{card.name}</span>
              <span className="card-artist">{card.artist}</span>
            </div>

            {/* Gap after each card */}
            {interactive && (
              <div
                className={`timeline-gap ${hoveredGap === index + 1 ? 'active' : ''}`}
                onMouseEnter={() => setHoveredGap(index + 1)}
                onMouseLeave={() => setHoveredGap(null)}
                onClick={() => handleGapClick(index + 1)}
              >
                <div className="gap-indicator">+</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Timeline;
