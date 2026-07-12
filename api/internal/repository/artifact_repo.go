package repository

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type ArtifactRepo struct {
	db *pgxpool.Pool
}

func NewArtifactRepo(db *pgxpool.Pool) *ArtifactRepo {
	return &ArtifactRepo{db: db}
}

func (a *ArtifactRepo) Create(ctx context.Context, artifact *model.Artifact) error {
	_, err := a.db.Exec(ctx,
		`INSERT INTO artifacts (id,run_id,step_result_id,type,key,value,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		artifact.ID, artifact.RunID, artifact.StepResultID, artifact.Type, artifact.Key, artifact.Value, artifact.CreatedAt,
	)
	return err
}

func (a *ArtifactRepo) GetForRun(ctx context.Context, runID string) ([]*model.Artifact, error) {
	rows, err := a.db.Query(ctx, "SELECT id,run_id,step_result_id,type,key,value,created_at FROM artifacts WHERE run_id=$1 ORDER BY created_at ASC", runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	artifacts := make([]*model.Artifact, 0)
	for rows.Next() {
		var art model.Artifact
		if err := rows.Scan(&art.ID, &art.RunID, &art.StepResultID, &art.Type, &art.Key, &art.Value, &art.CreatedAt); err != nil {
			return nil, err
		}
		artifacts = append(artifacts, &art)
	}
	return artifacts, nil
}

// GetExtractContext returns a map of extracted values for a run, only from passed steps before beforeStepIndex.
func (a *ArtifactRepo) GetExtractContext(ctx context.Context, runID string, beforeStepIndex int) (map[string]interface{}, error) {
	rows, err := a.db.Query(ctx,
		`SELECT a.key, a.value FROM artifacts a
		 JOIN step_results sr ON sr.id = a.step_result_id
		 WHERE a.run_id=$1 AND sr.step_index < $2 AND sr.status='passed'
		 ORDER BY sr.step_index ASC, a.created_at ASC`,
		runID, beforeStepIndex,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]interface{})
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		// Try to parse as number
		if n, err := strconv.ParseFloat(value, 64); err == nil && value != "" {
			result[key] = n
		} else {
			result[key] = value
		}
	}
	return result, nil
}
