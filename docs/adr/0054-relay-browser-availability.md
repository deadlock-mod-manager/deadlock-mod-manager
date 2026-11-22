# Keep the server browser available through relay and registry failures

Share worker-produced relay and registry snapshots through Redis, with process-local copies that expire so API replicas adopt updates. Retain the last good registry result through observed quota resets and report its age to the UI.
