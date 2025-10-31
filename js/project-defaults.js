export const createDefaultProject = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const start = new Date(Date.UTC(currentYear, 10, 1)); // November 1
  const end = new Date(Date.UTC(currentYear, 10, 30)); // November 30

  return {
    id: 'default-project',
    name: 'My Novel',
    goal: 50000,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
};

export default createDefaultProject;
