# Run the API without the Linkerd sidecar

Disable Linkerd injection for the API workload after sidecar OOM events cut its database and Redis connections under load. Ingress, Postgres and Redis are outside the mesh, so leaving the sidecar disabled avoids those interruptions without giving up mTLS for those paths.
