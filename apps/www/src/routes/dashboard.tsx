import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: session, isPending } = authClient.useSession();

	const navigate = Route.useNavigate();

	const privateData = useQuery(orpc.privateData.queryOptions());

	useEffect(() => {
		if (!session && !isPending) {
			navigate({
				to: "/login",
			});
		}
	}, [session, isPending]);

	if (isPending) {
		return <div>Loading...</div>;
	}

	return (
		<div>
			<h1>Dashboard</h1>
			<p>Welcome {session?.user.name}</p>
			<p>privateData: {privateData.data?.message}</p>
		</div>
	);
}
